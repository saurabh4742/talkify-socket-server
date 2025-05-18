const express = require("express");
const app = express();
const cors=require("cors")
const dotenv = require('dotenv');
dotenv.config();
app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
    res.status(200).json(`Welcome, SocketIO Backend`);
  });
exports.expressServer = app.listen(process.env.PORT_APP || 4000, () =>
  console.log(`${process.env.PORT_APP} Listening...`)
);