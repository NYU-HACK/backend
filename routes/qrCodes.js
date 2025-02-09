import { Router } from "express";
import { readQRCode } from "../data/qrCodes.js";

const router = Router();

router.route("/getInfo").post(async (req, res) => {
  if (!req.body)
    return res.json({ error: "Please supply a food product to scan" });

  const { qrCode } = req.body;
  try {
    const product = await readQRCode(qrCode);
    return res.json({ productFound: true, product: product });
  } catch (error) {
    return res.json(500).json({ error: "Internal Server Error" });
  }
});

export default router;
