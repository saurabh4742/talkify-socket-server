// server.js
const mongoose = require("mongoose");
const { createServer } = require("http");
const { Server } = require("socket.io");
const dotenv = require("dotenv");
const { v4: uuidv4 } = require("uuid");

dotenv.config();

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
     // Replace with your frontend URL
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// MongoDB connection (optional – for user data if needed)
mongoose
  .connect(
    process.env.MONGO_URI || "mongodb+srv://saurabhbebi:saurabh4742@cluster0.lpifw.mongodb.net/Talkify",
    { useNewUrlParser: true, useUnifiedTopology: true }
  )
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => console.error("❌ MongoDB error:", err));

// In-memory store
let rooms = []; // { id, firstUser, secondUser }
let userRoomMap = {}; // userId -> roomId

io.on("connection", (socket) => {
  console.log(`✅ New user connected: ${socket.id}`);

  // Join matchmaking
  socket.on("join-room", (userId) => {
    if (!userId) return;

    // Already assigned a room?
    if (userRoomMap[userId]) {
      const existingRoom = rooms.find((r) => r.id === userRoomMap[userId]);
      if (existingRoom) {
        socket.join(existingRoom.id);
        socket.emit("room-joined", existingRoom);
        return;
      }
    }

    // Look for an available room
    let room = rooms.find(
      (r) => r.secondUser === null && r.firstUser !== userId
    );

    if (room) {
      room.secondUser = userId;
      socket.join(room.id);
      userRoomMap[userId] = room.id;
      io.to(room.id).emit("room-joined", room);
      console.log(`👥 Matched: ${userId} joined room ${room.id}`);
    } else {
      // Create new room
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
    console.log(rooms ," --" ,userRoomMap);
  });

  // Leave room
  socket.on("leave-room", ({ userId, roomId }) => {
    if (!userId || !roomId) return;
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;

    socket.leave(roomId);
    if (room.firstUser === userId) room.firstUser = null;
    if (room.secondUser === userId) room.secondUser = null;

    delete userRoomMap[userId];

    // Remove room if empty
    if (!room.firstUser && !room.secondUser) {
      rooms = rooms.filter((r) => r.id !== roomId);
      console.log(`🗑️ Room deleted: ${roomId}`);
    }

    socket.emit("left-room");
    console.log(`👤 ${userId} left room ${roomId}`);
    console.log(rooms ," --" ,userRoomMap);
  });

  // Cleanup on disconnect
  socket.on("disconnect", () => {
    console.log(`❌ User disconnected: ${socket.id}`);

    for (const userId in userRoomMap) {
      const roomId = userRoomMap[userId];
      const room = rooms.find((r) => r.id === roomId);
      if (!room) continue;

      if (room.firstUser === userId) room.firstUser = null;
      if (room.secondUser === userId) room.secondUser = null;

      delete userRoomMap[userId];
      socket.leave(roomId);

      if (!room.firstUser && !room.secondUser) {
        rooms = rooms.filter((r) => r.id !== roomId);
        console.log(`🗑️ Room auto-deleted on disconnect: ${roomId}`);
      }
      console.log(rooms ," --" ,userRoomMap);
    }
  });
});

