import { A } from '@ember/array';
import { get } from '@ember/object';
import { settled } from '@ember/test-helpers';

import { module, test } from 'qunit';
import require, { has } from 'require';

import { gte } from 'ember-compatibility-helpers';
import { setupTest } from 'ember-qunit';

import Adapter from '@ember-data/adapter';
import Model, { attr } from '@ember-data/model';

// TODO move these tests to the DEBUG package
if (has('@ember-data/debug')) {
  const DebugAdapter = require('@ember-data/debug').default;

  class Post extends Model {
    @attr()
    title;
  }

  module('integration/debug-adapter - DS.DebugAdapter', function (hooks) {
    setupTest(hooks);

    let store;

    hooks.beforeEach(function () {
      let { owner } = this;

      owner.register('model:post', Post);
      store = owner.lookup('service:store');
      let _adapter = DebugAdapter.extend({
        getModelTypes() {
          return A([{ klass: Post, name: 'post' }]);
        },
      });
      owner.register('data-adapter:main', _adapter);
    });

    test('Watching Model Types', async function (assert) {
      assert.expect(5);
      let { owner } = this;
      let debugAdapter = owner.lookup('data-adapter:main');

      function added(types) {
        assert.equal(types.length, 1, 'added one type');
        assert.equal(types[0].name, 'post', 'the type is post');
        assert.equal(types[0].count, 0, 'we added zero posts');
        assert.strictEqual(types[0].object, store.modelFor('post'), 'we received the ModelClass for post');
      }

      function updated(types) {
        assert.equal(types[0].count, 1, 'We updated one record');
      }

      debugAdapter.watchModelTypes(added, updated);

      store.push({
        data: {
          type: 'post',
          id: '1',
          attributes: {
            title: 'Post Title',
          },
        },
      });
    });

    test('Watching Records', async function (assert) {
      let { owner } = this;
      let debugAdapter = owner.lookup('data-adapter:main');
      let addedRecords, updatedRecords, removedRecords;

      this.owner.register(
        'adapter:application',
        Adapter.extend({
          shouldBackgroundReloadRecord() {
            return false;
          },
        })
      );

      store.push({
        data: {
          type: 'post',
          id: '1',
          attributes: {
            title: 'Clean Post',
          },
        },
      });

      let recordsAdded = function (wrappedRecords) {
        addedRecords = wrappedRecords;
      };
      let recordsUpdated = function (wrappedRecords) {
        updatedRecords = wrappedRecords;
      };
      let recordsRemoved = function (...args) {
        // in 3.26 there is only 1 argument - the record removed
        // below 3.26, it is 2 arguments - the index and count removed
        // https://github.com/emberjs/ember.js/pull/19379
        removedRecords = args;
      };

      debugAdapter.watchRecords('post', recordsAdded, recordsUpdated, recordsRemoved);

      assert.equal(get(addedRecords, 'length'), 1, 'We initially have 1 post');
      let record = addedRecords[0];
      assert.deepEqual(record.columnValues, { id: '1', title: 'Clean Post' }, 'The initial post has the right values');
      assert.deepEqual(
        record.filterValues,
        { isNew: false, isModified: false, isClean: true },
        'The initial post has the right state'
      );
      assert.deepEqual(record.searchKeywords, ['1', 'Clean Post'], 'We have meaningful keywords');
      assert.deepEqual(record.color, 'black', 'We are given the right display color for a clean value');

      let post = await store.findRecord('post', 1);

      post.set('title', 'Modified Post');

      // await updated callback
      await settled();

      assert.equal(get(updatedRecords, 'length'), 1, 'We updated 1 post');
      record = updatedRecords[0];
      assert.deepEqual(
        record.columnValues,
        { id: '1', title: 'Modified Post' },
        'The modified values are correct for the post'
      );
      assert.deepEqual(
        record.filterValues,
        { isNew: false, isModified: true, isClean: false },
        'The modified state is correct for the post'
      );
      assert.deepEqual(record.searchKeywords, ['1', 'Modified Post'], 'The keywords have been updated');
      assert.deepEqual(record.color, 'blue', 'we have a color to represent we were modified');

      // reset
      addedRecords = updatedRecords = [];

      post = store.createRecord('post', { id: '2', title: 'New Post' });

      await settled();

      assert.equal(get(addedRecords, 'length'), 1, 'We are notified when we add a newly created post');
      record = addedRecords[0];
      assert.deepEqual(
        record && record.columnValues,
        { id: '2', title: 'New Post' },
        'The newly created post has the right values'
      );
      assert.deepEqual(
        record && record.filterValues,
        { isNew: true, isModified: false, isClean: false },
        'The newly created post has the right state'
      );
      assert.deepEqual(
        record && record.searchKeywords,
        ['2', 'New Post'],
        'The newly created post has meaningful keywords'
      );
      assert.deepEqual(record && record.color, 'green'),
        'The newly created post has meaningful color to represent new-ness';

      // reset
      addedRecords = updatedRecords = [];

      post.unloadRecord();

      await settled();

      if (gte('3.26.0')) {
        assert.equal(removedRecords.length, 1, 'We are notified of the total posts removed');
        assert.equal(removedRecords[0][0].object, post, 'The removed post is correct');
      } else {
        assert.equal(removedRecords[0], 1, 'We are notified of the start index of a removal when we remove posts');
        assert.equal(removedRecords[1], 1, 'We are notified of the total posts removed');
      }
    });

    test('Column names', function (assert) {
      let { owner } = this;
      let debugAdapter = owner.lookup('data-adapter:main');
      class Person extends Model {
        @attr()
        title;

        @attr()
        firstOrLastName;
      }

      const columns = debugAdapter.columnsForType(Person);

      assert.equal(columns[0].desc, 'Id');
      assert.equal(columns[1].desc, 'Title');
      assert.equal(columns[2].desc, 'First or last name');
    });
  });
}
