import express from "express";
import cors from "cors";
const app = express();

import configRoutes from "./routes/index.js";

app.use(cors("*"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

configRoutes(app);

app.listen(3000, () => {
  console.log("We've now got a server!");
  console.log("Your routes will be running on http://localhost:3000");
});
