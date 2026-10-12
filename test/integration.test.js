import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createApp } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createORM, useRepo } from 'pinia-orm';
import { createPiniaOrmAxios } from '@pinia-orm/axios';
import axios, { AxiosError } from 'axios';
import Model, { Response } from '../index.js';
import QueryExpander from '../src/query-expander.js';

class Author extends Model {
    static entity = 'authors';
    static fields() {
        return { id: this.attr(null), name: this.string('') };
    }
}

class Post extends Model {
    static entity = 'posts';
    static endpoint_list = '/posts';
    static endpoint_view = '/posts/view';
    static endpoint_create = '/posts/create';
    static endpoint_update = '/posts/update';
    static endpoint_delete = '/posts/delete';
    static fields() {
        return {
            id: this.attr(null),
            title: this.string(''),
            author_id: this.attr(null),
            author: this.belongsTo(Author, 'author_id'),
            tags: this.attr([]),
        };
    }
    static labels() { return { title: 'Title' }; }
    static transformers() {
        return {
            tags: {
                get: value => typeof value === 'object' ? value.id : value,
                set: id => ({ id }),
            },
        };
    }
}

let requests;
let respond;

beforeEach(() => {
    // The application supplies jQuery. These tests only need its shallow extend.
    globalThis.$ = { extend: Object.assign };
    requests = [];
    respond = () => ({ data: [] });
    const client = axios.create({
        adapter: async config => {
            requests.push(config);
            const response = {
                status: 200, statusText: 'OK', headers: {}, config,
                ...respond(config),
            };
            if (response.status >= 400) {
                throw new AxiosError('Request failed', 'ERR_BAD_REQUEST', config, null, response);
            }
            return response;
        },
    });
    const pinia = createPinia().use(createORM({
        plugins: [createPiniaOrmAxios({
            axios: client, baseURL: 'https://api.example.test',
        })],
    }));
    createApp({}).use(pinia);
    setActivePinia(pinia);
});

test('constructs models, transforms fields and tracks attribute changes', () => {
    const post = new Post({ title: 'Original', tags: [{ id: 3 }] });
    assert.equal(post.isNewRecord(), true);
    assert.equal(post.getAttributeLabel('title'), 'Title');
    assert.equal(post.getAttributeLabel('missing'), null);
    assert.deepEqual(post.tags, [3]);
    assert.deepEqual(post.$toJson().tags, [{ id: 3 }]);
    assert.equal(post.isDirty('title'), false);
    post.setAttributes({ title: 'Changed', ignored: true });
    assert.equal(post.isDirty('title'), true);
    assert.equal(post.ignored, undefined);
    post.updateOldValues(['title']);
    assert.equal(post.isDirty('title'), false);
    post.setAttributes({ title: 'Clean' }, false);
    assert.equal(post.isDirty('title'), false);
});

test('repository save, update and fresh retain model hooks', () => {
    const repo = useRepo(Post);
    repo.save({ id: 1, title: 'Saved' });
    assert.equal(repo.find(1).isDirty('title'), false);
    repo.save({ id: 1, title: 'Updated' });
    assert.equal(repo.find(1).title, 'Updated');
    assert.equal(repo.find(1).isDirty('title'), false);
    repo.fresh([{ id: 2, title: 'Replacement' }]);
    assert.equal(repo.find(1), null);
    assert.equal(repo.find(2).isDirty('title'), false);
});

test('list returns paginated, sorted models with expanded relations', async () => {
    respond = () => ({
        headers: { 'x-pagination-current-page': '2', 'x-pagination-total-count': '12' },
        data: [
            { id: 1, title: 'Alpha', author: { id: 10, name: 'Alice' } },
            { id: 2, title: 'Zulu', author: { id: 20, name: 'Bob' } },
        ],
    });
    const result = await Post.list({ expand: ['author'], expand_fields: ['summary'], sort: '-title', page: 2 });
    assert.ok(result instanceof Response);
    assert.equal(result.page, 2);
    assert.equal(result.total_items, 12);
    assert.deepEqual(result.entities.map(post => post.id), [2, 1]);
    assert.ok(result.entities[0] instanceof Post);
    assert.equal(result.entities[0].author.name, 'Bob');
    assert.equal(requests[0].baseURL, 'https://api.example.test');
    assert.deepEqual(requests[0].params, { expand: 'author,summary', page: 2, 'per-page': 5, sort: '-title' });
});

test('view selects the requested record and list handles empty responses', async () => {
    respond = () => ({ data: { id: 7, title: 'One' } });
    const result = await Post.view(7);
    assert.equal(result.entities[0].id, 7);
    assert.equal(requests[0].params.id, 7);
    respond = () => ({ data: [] });
    assert.deepEqual((await Post.list()).entities, []);
});

test('save uses POST for new records and PUT for existing records', async () => {
    respond = config => ({ status: config.method === 'post' ? 201 : 200, data: { ...JSON.parse(config.data), id: 8 } });
    const post = new Post({ title: 'New', tags: [{ id: 4 }] });
    const created = await post.save({ data: { extra: 'value' } });
    assert.equal(requests[0].method, 'post');
    assert.equal(requests[0].url, '/posts/create');
    assert.deepEqual(JSON.parse(requests[0].data).tags, [{ id: 4 }]);
    assert.equal(JSON.parse(requests[0].data).extra, 'value');
    assert.equal(created.entities[0].id, 8);
    const saved = useRepo(Post).find(8);
    saved.setAttributes({ title: 'Updated' });
    await saved.save();
    assert.equal(requests[1].method, 'put');
    assert.equal(requests[1].url, '/posts/update');
    assert.equal(useRepo(Post).find(8).title, 'Updated');
});

test('validate does not persist data and maps 422 errors to fields', async () => {
    const post = new Post({ title: 'Check' });
    respond = () => ({ data: { id: 99, title: 'Not persisted' } });
    await post.validate('/posts/validate');
    assert.equal(useRepo(Post).find(99), null);
    respond = () => ({ status: 422, data: [{ field: 'title', message: 'Required' }] });
    await assert.rejects(post.validate('/posts/validate'), AxiosError);
    assert.equal(post.hasErrors(), true);
    assert.equal(post.getErrorSummary(), 'Required');
    post.clearErrors('title');
    assert.equal(post.hasErrors(), false);
});

test('delete removes the record from the store', async () => {
    useRepo(Post).save({ id: 9, title: 'Delete me' });
    respond = () => ({ status: 204, data: null });
    await useRepo(Post).find(9).delete();
    assert.equal(requests[0].method, 'delete');
    assert.equal(requests[0].params.id, 9);
    assert.equal(useRepo(Post).find(9), null);
});

test('QueryExpander still supports nested relations on ORM v2 queries', () => {
    class Comment extends Model {
        static entity = 'comments';
        static fields() {
            return { id: this.attr(null), post_id: this.attr(null), post: this.belongsTo(Post, 'post_id') };
        }
    }
    useRepo(Comment).save({ id: 1, post: { id: 2, author: { id: 3, name: 'Nested' } } });
    const query = useRepo(Comment).query();
    assert.equal(QueryExpander.withAll(query, 'post.author'), query);
    assert.equal(query.first().post.author.name, 'Nested');
});
