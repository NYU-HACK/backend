import { static as staticDir } from "express";
import qrCodeRoutes from "./qrCodes.js";
import userRoutes from "./userRoutes.js";

const constructorMethod = (app) => {
  app.use("/", qrCodeRoutes);
  app.use("/", userRoutes);
  app.use("/public", staticDir("public"));
  app.use("*", (req, res) => {
    res.status(404).json({ Error: "Page not found" });
  });
};

export default constructorMethod;
