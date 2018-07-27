
/**
 * Module dependencies.
 */
// this is a node.js default class.
// link https://nodejs.org/dist/latest-v8.x/docs/api/events.html#events_class_eventemitter
var Emitter = require('events').EventEmitter;

/**
 * Module exports.
 */
// export Adapter
module.exports = Adapter;

/**
 * Memory adapter constructor.
 *
 * @param {Namespace} nsp
 * @api public
 */

function Adapter(nsp){
  this.nsp = nsp;
  this.rooms = {}; // rooms object
  this.sids = {}; // sids object
  // nsp.server.encoder should be redis({ host: 'localhost', port: 6379 }
  // it's like pass some our object
  this.encoder = nsp.server.encoder;
}

/**
 * Inherits from `EventEmitter`.
 */

// The __proto__ property of Object.prototype is an accessor property (a getter function and a setter function) that exposes the internal [[Prototype]] (either an object or null) of the object through which it is accessed.
Adapter.prototype.__proto__ = Emitter.prototype;

/**
 * Adds a socket to a room.
 *
 * @param {String} socket id
 * @param {String} room name
 * @param {Function} callback
 * @api public
 */
// the function accepts id room fn and return function this.addAll
Adapter.prototype.add = function(id, room, fn){
  // this.addAll - the inner function
  return this.addAll(id, [ room ], fn);
};

/**
 * Adds a socket to a list of room.
 *
 * @param {String} socket id
 * @param {String} rooms
 * @param {Function} callback
 * @api public
 */

Adapter.prototype.addAll = function(id, rooms, fn){
  //pass the array of rooms in the loop
  for (var i = 0; i < rooms.length; i++) {
    var room = rooms[i];
    // this.sids[id] = this.sids[id] == false than {} (this.sids[id] equl an empty object)
    this.sids[id] = this.sids[id] || {};
    this.sids[id][room] = true; // room true
    // Room is a constructor that has inside this.sockets{} and this.lengths = 0
    // if this room is a false than then will run the constructor and the object
    // the object will have the initiale data
    this.rooms[room] = this.rooms[room] || Room();
    // add is a Room.prototype.add the function that add a socket to the room
    this.rooms[room].add(id);
  }
  // if exist the clalback function bind to her
  // the fn will be called after executing the global socpe functions
  // fn functin will not have a this inside. because the first argument is a null
  if (fn) process.nextTick(fn.bind(null, null));
};

/**
 * Removes a socket from a room.
 *
 * @param {String} socket id
 * @param {String} room name
 * @param {Function} callback
 * @api public
 */

Adapter.prototype.del = function(id, room, fn){
  // if this sids[id] == false than initialize a new object
  this.sids[id] = this.sids[id] || {};
  delete this.sids[id][room]; // delete from sids[id][room]
  // The hasOwnProperty() method returns a boolean indicating whether the object has the specified property as its own property (as opposed to inheriting it).
  // if the this.rooms has property this.rooms.room than return true
  // it means the object was added this.rooms.room opposed inheriting
  if (this.rooms.hasOwnProperty(room)) {
    this.rooms[room].del(id);
    if (this.rooms[room].length === 0) delete this.rooms[room];
  }
  // put the callblack function to execute afther stack
  if (fn) process.nextTick(fn.bind(null, null));
};

/**
 * Removes a socket from all rooms it's joined.
 *
 * @param {String} socket id
 * @param {Function} callback
 * @api public
 */

Adapter.prototype.delAll = function(id, fn){
  // maybe sids[id] has an object rooms with the room list where a user is
  var rooms = this.sids[id];
  if (rooms) { // if exist rooms
    for (var room in rooms) { // pass the rooms elements by one
      if (this.rooms.hasOwnProperty(room)) {
        // del is an object Room function that removes an element from a room object
        this.rooms[room].del(id);
        if (this.rooms[room].length === 0) delete this.rooms[room];
      }
    }
  }
  delete this.sids[id]; // remobe the socket
  // run the user callback function after the main stack
  if (fn) process.nextTick(fn.bind(null, null));
};

/**
 * Broadcasts a packet.
 *
 * Options:
 *  - `flags` {Object} flags for this packet
 *  - `except` {Array} sids that should be excluded
 *  - `rooms` {Array} list of rooms to broadcast to
 *
 * @param {Object} packet object
 * @api public
 */

Adapter.prototype.broadcast = function(packet, opts){
  var rooms = opts.rooms || []; // list of rooms to broadcast to
  var except = opts.except || [];
  var flags = opts.flags || {};
  var packetOpts = {
    preEncoded: true,
    volatile: flags.volatile,
    compress: flags.compress
  };
  var ids = {};
  var self = this; // assign to self all of variables above
  var socket;

  packet.nsp = this.nsp.name;
  this.encoder.encode(packet, function(encodedPackets) {
    if (rooms.length) { // if exist rooms
      for (var i = 0; i < rooms.length; i++) { // pass in the loop
        var room = self.rooms[rooms[i]];
        if (!room) continue;
        var sockets = room.sockets;
        for (var id in sockets) {
          if (sockets.hasOwnProperty(id)) {
            // ~ operator NOT ~5 return -5
            // indexOF return the index
            if (ids[id] || ~except.indexOf(id)) continue;
            socket = self.nsp.connected[id];
            if (socket) {
              socket.packet(encodedPackets, packetOpts);
              ids[id] = true;
            }
          }
        }
      }
    } else {
      for (var id in self.sids) {
        if (self.sids.hasOwnProperty(id)) {
          if (~except.indexOf(id)) continue;
          socket = self.nsp.connected[id];
          if (socket) socket.packet(encodedPackets, packetOpts);
        }
      }
    }
  });
};

/**
 * Gets a list of clients by sid.
 *
 * @param {Array} explicit set of rooms to check.
 * @param {Function} callback
 * @api public
 */

Adapter.prototype.clients = function(rooms, fn){
  // The typeof operator returns a string indicating the type of the unevaluated operand.
  if ('function' == typeof rooms){
    fn = rooms;
    rooms = null;
  }

  rooms = rooms || [];

  var ids = {};
  var sids = [];
  var socket;

  if (rooms.length) {
    for (var i = 0; i < rooms.length; i++) {
      var room = this.rooms[rooms[i]];
      if (!room) continue;
      var sockets = room.sockets; // get the sockets from the room
      for (var id in sockets) { // get the id in sockets
        if (sockets.hasOwnProperty(id)) {
          if (ids[id]) continue;
          socket = this.nsp.connected[id];
          if (socket) {
            sids.push(id);
            ids[id] = true;
          }
        }
      }
    }
  } else { // pass to every room
    for (var id in this.sids) {
      if (this.sids.hasOwnProperty(id)) {
        socket = this.nsp.connected[id];
        if (socket) sids.push(id);
      }
    }
  }
  // put callback functin execute after the main stack
  if (fn) process.nextTick(fn.bind(null, null, sids));
};

/**
 * Gets the list of rooms a given client has joined.
 *
 * @param {String} socket id
 * @param {Function} callback
 * @api public
 */
Adapter.prototype.clientRooms = function(id, fn){
  var rooms = this.sids[id];
  // in the callback function you can get rooms
  if (fn) process.nextTick(fn.bind(null, null, rooms ? Object.keys(rooms) : null));
};

/**
* Room constructor.
*
* @api private
*/

function Room(){
  // this
  if (!(this instanceof Room)) return new Room();
  this.sockets = {};
  this.length = 0;
}

/**
 * Adds a socket to a room.
 *
 * @param {String} socket id
 * @api private
 */
// the function add a socket to a room
Room.prototype.add = function(id){
  if (!this.sockets.hasOwnProperty(id)) {
    this.sockets[id] = true;
    this.length++;
  }
};

/**
 * Removes a socket from a room.
 *
 * @param {String} socket id
 * @api private
 */
// the function delete from a room a user
Room.prototype.del = function(id){
  if (this.sockets.hasOwnProperty(id)) {
    delete this.sockets[id];
    this.length--;
  }
};
