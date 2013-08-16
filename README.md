# Binder

__Bind AngularJS models to anything.__

_Status: Experimental, In-Development._

<a id="overview"></a>
## Overview

The `Binder` module is a toolkit to enable realtime data synchronization between AngularJS apps and various [protocols & persistence layers](#protocol).

The module is built to be flexible enough to support arbitrary protocols to react to in-memory model changes. Building a re-usable protocol is a matter of implementing the [interface](#iprotocol) expected by the `$binder` service, then managing the details of reading, subscribing to, and writing to the persistence layer underneath. For example, a protocol could be written for HTML5 LocalStorage, a REST API, an API using WebSockets, or any combination of arbitrary technologies underneath.

`Binder` provides the following tools to make two-way data binding simple:

 * Bind scope models directly to a protocol, based on an optional protocol-specific [query](#binder).
 * [Change Pipelining](#change-pipeline): Bi-directional change pipelining supports writing of middleware-like functions to operate on a [`delta`](#delta) object in order after a change is registered from a local model or a protocol.
 * Small libraries with utility methods to add common processing to [Change Pipelines](#change-pipeline), such as [throttling](#throttler), [delta analysis](#differ), change batching (not yet implemented).

Currently, the `Binder` toolchain is focused on supporting synchronization of strings, arrays, and objects, but should eventually have a good story for binary data.


## Getting Started

_Simple Example_

```javascript
var app = angular.module('myApp', ['Binder']);
app.controller('MyCtrl', function ($scope, $binder, someJSONAPI) {
  var myProtocol = someJSONAPI({url: 'http://myhost'});
  var myBinder = $binder({protocol: myProtocol});
  $scope.myProducts = [{title: 'Widget'}, {title: 'Doodad'}];
  var binder = myBinder.bind({
    scope: $scope,
    model: 'myProducts'
  });
});
```

_Robust Example_
```javascript
var app = angular.module('myApp', ['Binder']);
app.controller('MyCtrl', function ($scope, $binder, differ, $throttler, someJSONAPI) {
  var myProtocol = someJSONAPI({url: 'http://myhost'});
  var mySyncer = $binder({protocol: myProtocol});
  var myQuery = {
    path: '/path/to/stuff'
  };
  $scope.myProducts = [{title: 'Widget'}, {title: 'Doodad'}];
  var binder = mySyncer.bind({
    scope: $scope,
    model: 'myProducts',
    query: myQuery,
    key: 'id',
    type: 'collection',
    onModelChange: [$throttler(250), differ.compareArrays],
    onProtocolChange: [function (binder, delta, next) {
      delta.random = Math.random();
      next();
    }]
  });
});
```

## Concepts

<a id="change-pipeline"></a>
### Change Pipeline

The Change Pipeline gives the ability write application-specific processing logic for data as it changes locally or from a protocol. When binding to a model, the `bind` method can accept an object with `onModelChange` and `onProtocolChange` methods or arrays of methods, which will be executed in order each time a change occurs. This enables developers to write or re-use middleware-like functions to examine and manipulate `delta` objects as they progress through the Change Pipeline.

Protocols can recommend that Change Pipelines be ignored, and that the protocol should be trusted to do all the heavy lifting of processing a model change. But for protocols that allow some flexiblity in how data is persisted, the Change Pipeline is the right context in which to make those decisions.

<a id="protocol"></a>
### Protocol

The underlying power of `Binder` is in the protocols that can be developed to power it. The `$binder` service manages watching models for updates, executing the developer-specified [Change Pipeline](#change-pipeline), and calling appropriate methods on a protocol when the [Change Pipeline](#change-pipeline) is complete. For example, once all functions in a model's [Change Pipeline](#change-pipeline) have been called, the `$binder` service will look at the `type` property of [`delta`](#delta) to determine which method of a protocol should be called with the change. By default, `$binder` will call `protocol.change(binder, delta)`, leaving all responsibilty to the protocol to determine the best way to persist the model change. In fact, a protocol may prefer this if it has strict constraints on how to persist data changes.

<a id="iprotocol"></a>
#### IProtocol

If a protocol would like to take advantage of opt-in policies provided by `Binder`, in can implement the following supported methods. Except where otherwise indicated, all methods implement the signature `function (binder, delta) {}`.

 * __create__ - Persist a newly-created object to the protocol.
 * __read__ - Used to retrieve a full model representation from a protocol. (__Use case?__)
 * __update__ - Update an existing model in a protocol.
 * __remove__ - Remove a model from the protocol.
 * __subscribe__ - This method is called as soon as `$binder.bind` is called, in order to get an initial value for the model and to automatically update the model upon further changes in the persistence layer. Implements signature `function (binder, callback) {}`, and calls `callback` each time a relevant update occurs. Ideally, the protocol will be able to provide some initial data on the `delta`, such as the type of change, and of course, some representation of the changed data.
 * __unsubscribe__ - Implements signature `function (binder, callback) {}`, called when a bound scope is destroyed or when `$binder.unbind()` is called.
 * __change__ - A catch-all method if no methods have been added to the Change Pipeline to set `delta.type` to the appropriate type of change. This method leaves it up to the protocol to figure out how to persist a change. Some protocols may prefer to not perform any analysis on a `delta` before giving it to the protocol, so a protocol can decide the best strategy for persisting and merging objects.

It's important to note that unless an [`onModelChange`](#change-pipeline) pipeline provides functions to analyze model changes and set `delta.type`, it's up to the protocol to figure out how to handle a change by looking at the `newVal` and `oldVal` of the `delta`.

Protocols make use of the `query` object attached to a `binder` when calling syncResource.bind() to ensure that the data is being persisted properly. Queries may contain a URL path to a resource on a server, an id of a particular object, or filters to restrict changes to certain items. `$binder` has no policy on what type of object a query is, or what properties it contains. The extent of the policy is that if different models should be treated differently by a protocol, the place to store the instructions is on `binder.query`.

The protocol interface is still being actively developed, and will  change.

<a id="binder"></a>
### binder

`$binder` calls the private `$binder` factory when calling `myBinder.bind()`. The `$binder` factory takes an object map as its only argument, which contains the following properties:

 * __scope__ (scope instance: required) - The scope in which to watch the model.
 * __model__ (string: required) - Name of the model to watch on the provided scope.
 * __query__ (*: optional) - A query, if necessary. This is available as `binder.query` in any [Change Pipeline](#change-pipeline) functions, but is otherwise only used by some protocols.
 * __type__ (string: optional) - Should be one of constants available in [`binderTypes`](#binderTypes) service. This is useful to help protocols know how to analyze changes, but should be used as a best practice to take advantage of future enhancements to the `Binder` module.
 * __onModelChange__ (function or array of functions: optional) - Function(s) to be executed in order after a model change has occurred. Should implement signature `function (binder, delta, next) {}` and should call `next()` when complete.
 * __onProtocolChange__ (function or array of functions: optional) - Same as `onModelChange` but reverse direction.
 * __key__ (string: optional) - If the model is a collection of objects, the key helps methods in the [Change Pipeline](#change-pipeline) by confirming which property in the collection should be unique.

Each `$binder` instance is associated with one model in one scope. The `$binder` should generally be treated as a static object, as far as the [Change Pipeline](#change-pipeline) is concerned. But it's useful to occasionally store temporary metadata or temporary data on a binder. For example, when model updates are being throttled, it would be appropriate to store a temporary queue of changes on the `binder` to be batched in a later call to a protocol.

The `binder` is accessible in every part of the [Change Pipeline](#change-pipeline).

<a id="delta"></a>
### delta

A new `delta` object is created each time a change is registered from a local model or protocol. The `delta` is passed to every method in the [Change Pipeline](#change-pipeline). There are no rules on what properties it can contain, but the currently-supported properties include:

 * __data__ (*: required) - This property should be set when the `delta` object is created. `Binder` doesn't care about its type or contents, as long as it is present. It's up to [Change Pipeline](#change-pipeline) and protocol methods to update the data (and other properties) as the `delta` progresses through the chain.
 * __newVal__ (*: optional) - If the change originates from a local model, the `$binder` will assign `newVal` and `oldVal` directly from the `scope.$watch` callback.
 * __oldVal__ (*: optional) - See `newVal`.
 * __type__ (string: optional) - Represents the type of change, such as add/remove/update. Should be a constant from the `syncEvents` service, unless there's some newfangled event that isn't part of that dictionary, which the protocol would know how to support.
 * __silent__ (boolean: optional) - Can be set from the [protocol](#protocol) at the beginning of the [onProtocolChange pipeline](#change-pipeline) to prevent the onModelChange pipeline from immediately responding to the updated model. This will only prevent a single occurence of the `onModelChange` pipeline, and will not stop the model change from propagating elsewhere in the Angular application.

## Services

### $binder

`$binder` is a factory whose instances can be used in any scope to bind any of the scope's models to a protocol. A `$binder` instance has a 1:1 relationship with a protocol, but can be used to bind multiple models in multiple scopes. As a best practice, `$binder` instances should be configured in a service.

Example using one `$binder` instance in multiple scopes.

```javascript
var myApp = angular.module('myApp', ['Binder']);
myApp.factory('myBinder', function ($binder, someJSONAPI) {
  var myProtocol = someJSONAPI({url: 'http://myprotocol'});
  var myBinder = $binder({protocol: myProtocol});
  return myBinder;
});

myApp.controller('ProfileCtrl', function ($scope, myBinder) {
  $scope.me = {name: "Jeff", likes: ['cats']};
  var query = { //Protocol-specific query
    path: '/users/me'
  }
  var binder1 = myBinder.bind({
    scope: $scope,
    model: 'me',
    query: query
  });
});

myApp.controller('FriendCtrl', function ($scope, myBinder) {
  $scope.myFriends = [];
  $scope.me = {username: "jeffbcross"};
  var binder = myBinder.bind({
    scope: $scope,
    model: 'myFriends',
    type: 'collection',
    key: 'username',
    query: { //Protocol-specific query
      path: '/users',
      filter: {
        friends: { $in: [$scope.me.username] }
      }
    }
  });
})
```

<a id="differ"></a>
### differ

The `differ` service provides simple utility methods to do simple diff analysis between the newVal and oldVal of a `delta` object. Its purpose is to support common needs for analyzing changes, in order to send _only_ changes to protocols that can support this, unlike protocols that require sending full model representations with updates.

Each public method of `differ` implements the proper signature for middleware chaining in the [Change Pipeline](#change-pipeline): `function (binder, delta, next) {}`.

Currently this utility is in a very basic state, with limited usefulness. For example, it is only able to find one change in any type of object, instead of multiple changes or batches of changes. It presently only implements methods for arrays and strings.

#### Methods

 * __compareArrays__ - A convenience method that determines what changed about an array, then delegates to a more specialized method. This method sets a `type` property on the delta, based on a common [`syncEvents`](#sync-events) dictionary. Once this method determines the type of change, it delegates to one of `findAddedItem`, `findRemovedItem`, `findUpdatedItem`.
 * __findAddedItem__ - Iterates through `delta.newVal` and `delta.oldVal` arrays to determine what item was added, and at what position. Assigns new object to `delta.data`, and assigns the index of the new object to `delta.position`.
 * __findRemovedItem__ - Iterates through `delta.newVal` and `delta.oldVal` arrays to determine what item was removed, and at what position. Adds `position` property to `delta`, as well as a `data` property which contains the entire removed object.
 * __findUpdatedItem__ - Iterates through `delta.newVal` and `delta.oldVal` arrays to determine what item was updated, and its position.
 * __compareStrings__ - A convenience method that _tries_ to determine what changed about a string, adds a `type` property to the `delta`, and then delegates to a more specialized method to find the change. It delegates to one of `findAddedString`, `findRemovedString`, `findChangedString`.
 * __findAddedString__ - Similar to `findAddedItem`, but finds where a string was added within another string, and assigns the different part of the string to `delta.data`.
 * __findRemovedString__ - Similar to `findRemovedItem`, but finds where a string was removed, and what the removed contents are.
 * __findChangedString__ - Similar to `findChangedItem`, but finds where a change begins in a string, and sets the entire changed portion to `delta.data`.

The example below shows how the `differ.compareArrays` method would be implemented in the `onModelChange` [Change Pipeline](#change-pipeline). The result of this would be that the [Change Pipeline](#change-pipeline) would commence after pushing the new post to `$scope.posts`, with the `delta` being given to the protocol with the `type`, `data`, and `position` properties being set to "add", {title: 'How to Email'}, and 1 respectively.

```javascript
var myApp = angular.module('myApp', ['Binder']);
myApp.factory('myBinder', function ($binder, someJSONAPI) {
  var myProtocol = someJSONAPI({url: 'http://myprotocol'});
  var myBinder = $binder({protocol: myProtocol});
  return myBinder;
});

myApp.controller('ProfileCtrl', function ($scope, differ, myBinder) {
  $scope.posts = [{title: 'How to Search the Web'}];
  var binder = myBinder.bind({
    scope: $scope,
    model: 'posts',
    onModelChange: [differ.compareArrays]
  });
  $scope.posts.push({title: 'How to Email'});
});
```

<a id="throttler"></a>
### $throttler

The `$throttler` service provides a simple factory that accepts one argument, a number of milliseconds by which to delay the [Change Pipeline](#change-pipeline), and returns a middleware function to be added to the [Change Pipeline](#change-pipeline), usually at the first step. If another change is fired before the `$throttler` has executed, the previous [Change Pipeline](#change-pipeline) will be cancelled.

```javascript
...
app.controller('MyCtrl', function ($scope, $throttler, myBinder) {
  var binder = myBinder.bind({
    scope: $scope,
    model: 'myModel',
    onModelChange: [$throttler(250)]
  });
});
```

Currently, the service is very limited in that when the [Change Pipeline](#change-pipeline) continues, the `delta` will only contain `newVal` and `oldVal` from the most recent change.

### syncEvents

A static dictionary service of event constants to be applied to `deltas` as they progress through a [Change Pipeline](#change-pipeline). Presently contains these constants, but this list will probably double in length:

 * __GET__ - Simple read operation, typically only initiated by a protocol, and typically the intent is to blindly write data to the local model.
 * __MOVE__ - An item in a collection has changed position.
 * __ADD__ - A new item has been created in a collection.
 * __REMOVE__ - An item has been removed, probably from a collection, but not necessarily.
 * __CREATE__ - An item has been created. Similar to `ADD`, but not necessarily in the context of a collection.
 * __UPDATE__ - An existing item has changed one or more values.
 * __NONE__ - Nothing to see here.
 * __UNKNOWN__ - Something has happened, but it's not clear what.

```javascript
...
var binder = myBinder.bind({
  scope: $scope,
  model: 'myModel',
  type: binderTypes.COLLECTION,
  onModelChange: [function (binder, delta, next) {
    if (delta.newVal.length > delta.oldVal.length) {
      delta.type = syncEvents.ADD;
    }
    next();
  }]
})
```

<a id="binderTypes"></a>
### binderTypes

A static dictionary of model types which can be optionally be added to the config object passed into [`binder`](#binder) in order to provide an opportunity to reduce ambiguity in [Change Pipeline](#change-pipeline) methods, and potentially the protocol. This value can help Binder know how to create or update models in ambiguous circumstances. The service currently contains the following constants:

 * __COLLECTION__ - For lists of any type of data.
 * __OBJECT__ - For plain old objects.
 * __BOOLEAN__
 * __STRING__
 * __NUMBER__
 * __BINARY__ - For binary data such as an image, video, audio clip.
 * __BINARY_STREAM__ - For streaming binary data such as video chat or audio call.

```javascript
...
var binder = myBinder.bind({
  scope: $scope,
  model: 'myModel',
  type: binderTypes.COLLECTION
})
```