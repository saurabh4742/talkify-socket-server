// server.js
const mongoose = require("mongoose");
const { createServer } = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const { v4: uuidv4 } = require("uuid");
dotenv.config();

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

let rooms = []; // { id, firstUser, secondUser }
let userRoomMap = {}; // userId => roomId
let socketUserMap = {}; // socket.id => userId

// Chat message schema (optional for storing messages)
const chatSchema = new mongoose.Schema({
  roomId: String,
  senderId: String,
  message: String,
  createdAt: { type: Date, default: Date.now },
});
const Chat = mongoose.model("Chat", chatSchema);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connected to MongoDB"))
  .catch((err) => console.error("MongoDB connection error:", err));

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("join-room", (userId) => {
    if (!userId) return;
    socketUserMap[socket.id] = userId;

    if (userRoomMap[userId]) {
      const existingRoom = rooms.find((r) => r.id === userRoomMap[userId]);
      if (existingRoom) {
        socket.join(existingRoom.id);
        socket.emit("room-joined", existingRoom);
        return;
      }
    }

    const waitingRooms = rooms.filter(
      (r) => r.secondUser === null && r.firstUser !== userId
    );

    if (waitingRooms.length > 0) {
      const room = waitingRooms[Math.floor(Math.random() * waitingRooms.length)];
      room.secondUser = userId;
      userRoomMap[userId] = room.id;
      socket.join(room.id);
      io.to(room.id).emit("room-joined", room);
      console.log(`${userId} joined room ${room.id}`);
    } else {
      const newRoomId = uuidv4();
      const newRoom = { id: newRoomId, firstUser: userId, secondUser: null };
      rooms.push(newRoom);
      userRoomMap[userId] = newRoomId;
      socket.join(newRoomId);
      socket.emit("room-joined", newRoom);
      console.log(`Room created: ${newRoomId} by ${userId}`);
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
      console.log(`Room deleted: ${roomId}`);
    }

    socket.emit("left-room");
    console.log(`${userId} left room ${roomId}`);
  });

  socket.on("send-message", async ({ userId, roomId, message }) => {
    if (!userId || !roomId || !message) return;

    io.to(roomId).emit("receive-message", {
      senderId: userId,
      message,
    });
  });

  socket.on("disconnect", () => {
    const userId = socketUserMap[socket.id];
    if (!userId) {
      console.log(`Unknown socket disconnected: ${socket.id}`);
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
      console.log(`Room auto-deleted: ${roomId}`);
    }

    console.log(`User disconnected: ${userId} (socket: ${socket.id})`);
  });
});

httpServer.listen(process.env.PORT || 4000, () => {
  console.log("Socket.IO server running on port", process.env.PORT || 4000);
});
