var log4js = require('log4js');
var express = require('express');
var app = express();
var http = require('http').Server(app);
const path = require('path');
var io = require('socket.io')(http);
var util = require('util');
var moment = require('moment');
var fs = require('fs');
var dir = './logs';

if (!fs.existsSync(dir)){
    fs.mkdirSync(dir);
}

log4js.configure({
 appenders: [
   { type: 'console' },
   {
		"type": "dateFile",
		"filename": "logs/chat.log",
		"pattern": "-yyyy-MM-dd",
		"alwaysIncludePattern": false
	}
  ]
});

var logger = log4js.getLogger('chat');
logger.setLevel('info');

const HOST = 'localhost';
const PORT = 3000;

var rooms = {};
var users = {};
var groups = {};
var sidUnameMap = {};

app.use(express.static(path.join(__dirname, 'build')));

app.get('/', function(req,res){
	res.sendFile(__dirname + "/build/" + "index.html");
});

io.on('connection', function(socket){
	logger.debug("Client Connected. " + socket.id);
	var id = socket.id;
	users[id] = {};
	sidUnameMap[id] = null;

	function updateClients(){
		var roomId = users[id].roomId;
		var grpUsers = rooms[roomId].users;
		io.to(roomId).emit('users', grpUsers);
	}

	socket.on('room id', function(msg){
		var roomId = msg.toString();
		if(isNaN(roomId)){
			return;
		}
		var found = rooms[roomId];
		if(!found){
			logger.debug(roomId+ " Room does not exist. Creating specified room...");
			logger.info("Room Number : "+roomId);
			rooms[roomId] = {};
			rooms[roomId].users = [];
			rooms[roomId].drawings = [];
		}

		users[id].roomId = roomId;
		if(rooms[roomId]){
			rooms[roomId].users.push(id);
			logger.debug("\n***USERS: " + util.inspect(users));
			logger.debug("\n***ROOMS: " + util.inspect(rooms));
			socket.join(users[id].roomId);
			updateClients();
			socket.emit('initDrawings', rooms[roomId].drawings);
			logger.debug("Sent Drawings: " + util.inspect(rooms[roomId].drawings));
		}
	});

	socket.on('submit name', function(name){
		users[id].name = name;
		sidUnameMap[socket.id] = name;
		updateClients();
	});

	socket.on('disconnect', function(){
		logger.debug("Disconnected");
		var roomId = users[id].roomId;
		if(!roomId){
			delete users[id];
		}
		if(rooms[roomId] === undefined){
			logger.debug("Invalid Room Operation");
			return;
		}
		var indexToBeRemoved = rooms[roomId].users.indexOf(id);
		rooms[roomId].users.splice(indexToBeRemoved, 1);
		updateClients();
		if(rooms[roomId] && rooms[roomId].users.length === 0){
			//No user left in this room. Delete it.
			delete rooms[roomId];
		}
		delete users[id];
		socket.leave(roomId);
		logger.debug("\n***USERS: " + util.inspect(users));
		logger.debug("\n***ROOMS: " + util.inspect(rooms));
	});

	socket.on('chat message', function(msg){
		logger.debug("Got Msg : " + msg + " From " + id + " in Room : " + users[id].roomId);
		var uName = users[id].name ? users[id].name : id;
		io.to(users[id].roomId).emit('chat message', {time:moment().format(), name:uName, data:msg});
	});

	socket.on('cursorStart', function(msg){
		var name = users[id].name ? users[id].name : id;
		//io.to(users[id].roomId).emit('cursorStart', {name:name, drawingData:msg});
		socket.broadcast.to(users[id].roomId).emit('cursorStart', {name:name, drawingData:msg});
	});	

	socket.on('updateCursor', function(msg){
		var name = users[id].name ? users[id].name : id;
		//io.to(users[id].roomId).emit('updateCursor', {name:name, drawingData:msg});
		socket.broadcast.to(users[id].roomId).emit('updateCursor', {name:name, drawingData:msg});
	});

	socket.on('addDrawing', function(msg){
		var roomId = users[id].roomId;
		let drawingId = 0;
		if(!roomId || rooms[roomId]==undefined){
			return;
		}
		if(rooms[roomId].drawings.length===0){
			drawingId = 0;
		}
		else{
			drawingId = rooms[roomId].drawings[rooms[roomId].drawings.length-1].drawingId + 1;
		}
		var drawing = {
			userId: id,
			drawingId: drawingId,
			name: users[id].name ? users[id].name : id, 
			addedTime: moment().format(),
			lastUpdatedUserId: id,
			lastUpdatedTime: moment().format(),
			drawingData: msg
		};
		rooms[roomId].drawings.push(drawing);
		//socket.broadcast.to(users[id].roomId).emit('addDrawing', drawing);
		io.to(users[id].roomId).emit('addDrawing', drawing);
	});

	socket.on('removeDrawing', function(drawingId){
		var roomId = users[id].roomId;
		if(!roomId || rooms[roomId]==undefined){
			return;
		}
		
		rooms[roomId].drawings = rooms[roomId].drawings.filter(drawing=>drawing.drawingId != drawingId);
		//socket.broadcast.to(users[id].roomId).emit('addDrawing', drawing);
		io.to(users[id].roomId).emit('removeDrawing', drawingId);
	});

	socket.on('clearAll', function(){
		logger.debug('Clear All');
		var roomId = users[id].roomId;
		if(!roomId){
			return;
		}
		io.to(roomId).emit('clearAll');
		rooms[roomId].drawings = [];
	});	

	socket.on("video data", function(msg){
		var name = users[id].name ? users[id].name : id;
		io.to(users[id].roomId).emit("video data", {name:name, videoData:msg});
	});
});

http.listen(PORT, function(){
	logger.info(`URL: http://${HOST}:${PORT}/`);
});