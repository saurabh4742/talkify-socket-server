// server.js
const mongoose = require("mongoose");
const { createServer } = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const { v4: uuidv4 } = require("uuid");
dotenv.config();
const PORT=process.env.PORT || 3001
let count = 0;
let httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN_URL,
    methods: ["GET", "POST"],
    allowedHeaders: ["my-custom-header"],
    credentials: true,
  },
});

let rooms = []; // { id, firstUser, secondUser }
let userRoomMap = {}; // userId => roomId
let socketUserMap = {}; // socket.id => userId

// Connect to MongoDB
mongoose
  .connect("mongodb+srv://saurabhbebi:saurabh4742@cluster0.lpifw.mongodb.net/Talkify")
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

io.on("connection", (socket) => {
  console.log(`New user connected Id ${socket.id}`);
  count++;
socket.on("next-match", (userId) => {
  if (!userId) return;

  const currentRoomId = userRoomMap[userId];
  const currentRoom = rooms.find((r) => r.id === currentRoomId);

  // Leave current room
  if (currentRoom) {
    socket.leave(currentRoomId);

    if (currentRoom.firstUser === userId) {
      if (currentRoom.secondUser) {
        currentRoom.firstUser = currentRoom.secondUser;
        currentRoom.secondUser = null;
      } else {
        currentRoom.firstUser = null;
      }
    } else if (currentRoom.secondUser === userId) {
      currentRoom.secondUser = null;
    }

    if (!currentRoom.firstUser && !currentRoom.secondUser) {
      rooms = rooms.filter((r) => r.id !== currentRoomId);
      console.log(`🗑️ Room deleted on next: ${currentRoomId}`);
    }

    delete userRoomMap[userId];
  }

  // Now find a new match randomly
  const waitingRooms = rooms.filter(
    (r) => r.secondUser === null && r.firstUser !== userId
  );

  if (waitingRooms.length > 0) {
    const newRoom = waitingRooms[Math.floor(Math.random() * waitingRooms.length)];
    newRoom.secondUser = userId;
    userRoomMap[userId] = newRoom.id;
    socket.join(newRoom.id);
    io.to(newRoom.id).emit("room-joined", newRoom);
    console.log(`🔁 ${userId} matched into new room ${newRoom.id}`);
  } else {
    const newRoomId = uuidv4();
    const newRoom = {
      id: newRoomId,
      firstUser: userId,
      secondUser: null,
    };
    rooms.push(newRoom);
    userRoomMap[userId] = newRoomId;
    socket.join(newRoomId);
    socket.emit("room-joined", newRoom);
    console.log(`🆕 New room created for next: ${newRoomId} by ${userId}`);
  }
});

socket.on("join-room", (userId) => {
  if (!userId) return;

  // Save mapping
  socketUserMap[socket.id] = userId;

  // Already in a room?
  if (userRoomMap[userId]) {
    const existingRoom = rooms.find((r) => r.id === userRoomMap[userId]);
    if (existingRoom) {
      socket.join(existingRoom.id);
      socket.emit("room-joined", existingRoom);
      return;
    }
  }

  // Get all rooms where secondUser is null (i.e. waiting)
  const waitingRooms = rooms.filter(
    (r) => r.secondUser === null && r.firstUser !== userId
  );

  if (waitingRooms.length > 0) {
    // Pick a random room
    const room = waitingRooms[Math.floor(Math.random() * waitingRooms.length)];

    room.secondUser = userId;
    userRoomMap[userId] = room.id;
    socket.join(room.id);
    io.to(room.id).emit("room-joined", room);
    console.log(`🎯 Random match: ${userId} joined room ${room.id}`);
  } else {
    // No available rooms, create new one
    const newRoomId = uuidv4();
    const newRoom = {
      id: newRoomId,
      firstUser: userId,
      secondUser: null,
    };
    rooms.push(newRoom);
    userRoomMap[userId] = newRoomId;
    socket.join(newRoomId);
    socket.emit("room-joined", newRoom);
    console.log(`🆕 Room created: ${newRoomId} by ${userId}`);
  }
});


  socket.on("leave-room", ({ userId, roomId }) => {
    if (!userId || !roomId) return;

    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;

    socket.leave(roomId);

    if (room.firstUser === userId) {
      if (room.secondUser) {
        room.firstUser = room.secondUser;
        room.secondUser = null;
      } else {
        room.firstUser = null;
      }
    } else if (room.secondUser === userId) {
      room.secondUser = null;
    }

    delete userRoomMap[userId];

    if (!room.firstUser && !room.secondUser) {
      rooms = rooms.filter((r) => r.id !== roomId);
      console.log(`🗑️ Room deleted: ${roomId}`);
    }

    socket.emit("left-room");
    console.log(`👤 ${userId} left room ${roomId}`);
    console.log("Rooms:", rooms);
  });

  socket.on("disconnect", () => {
    count--;
    const userId = socketUserMap[socket.id];
    if (!userId) {
      console.log(`❌ Unknown user disconnected: ${socket.id}`);
      return;
    }

    const roomId = userRoomMap[userId];
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;

    socket.leave(roomId);

    if (room.firstUser === userId) {
      if (room.secondUser) {
        room.firstUser = room.secondUser;
        room.secondUser = null;
      } else {
        room.firstUser = null;
      }
    } else if (room.secondUser === userId) {
      room.secondUser = null;
    }

    delete userRoomMap[userId];
    delete socketUserMap[socket.id];

    if (!room.firstUser && !room.secondUser) {
      rooms = rooms.filter((r) => r.id !== roomId);
      console.log(`🗑️ Room auto-deleted on disconnect: ${roomId}`);
    }

    console.log(`❌ User disconnected: ${socket.id} (${userId})`);
  });
});

exports.expressServer = httpServer.listen(PORT, () =>
  console.log(`Listening ${PORT} SocketIO...`)
);
