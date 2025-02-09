import { Router } from "express";
import {
  checkIsProperFirstOrLastName,
  validateEmail,
  checkIsProperPassword,
  validateId,
} from "../helpers.js";

import {
  insertUser,
  addItemToUser,
  updateItemsForUser,
  verifyToken,
  suggestRecipes,
  getItemsByUserId,
  getChatsForUser,
  chatWithOpenAI,
  getKPIs,
} from "../data/users.js";

const router = Router();

router.route("/signup").post(async (req, res) => {
  try {
    let { firstName, lastName, email, password, confirmPassword } = req.body;
    firstName = checkIsProperFirstOrLastName(firstName, "First Name");
    lastName = checkIsProperFirstOrLastName(lastName, "Last Name");
    email = validateEmail(email);
    password = checkIsProperPassword(password);
    if (password !== confirmPassword)
      throw new Error("Password and Confirm password are not same");

    const createUser = await insertUser(firstName, lastName, email, password);

    return res.json(createUser);
  } catch (error) {
    res.status(400).json({ signUpSuccessful: false, error: error.message });
  }
});

router.route("/addItem/:userId").post(async (req, res) => {
  try {
    req.params.userId = validateId(req.params.userId);
    let { code, name, brand, category, quantity, expirationDate, manualEntry } =
      req.body;
    const addItem = await addItemToUser(
      req.params.userId,
      code,
      name,
      brand,
      category,
      quantity,
      expirationDate,
      manualEntry,
      price
    );
    return res.json(addItem);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

// router.route("removeItem/:userId/:itemId").delete(async (req, res) => {
//   try {
//     req.params.itemId = validateId(req.params.itemId);
//     req.params.userId = validateId(req.params.userId);
//     const updateUser = await removeItemFromUser(
//       req.params.userId,
//       req.param.itemId
//     );

//     return updateUser;
//   } catch (error) {
//     return res.status(400).json({ error: error.message });
//   }
// });

router.route("/login").post(async (req, res) => {
  try {
    const { token } = req.body;
    const user = await verifyToken(token);
    return res.json(user);
  } catch (error) {
    return res.json(401).json({ error: "Invalid Token" });
  }
});

router.route("/updateItem/:userId/:itemId").put(async (req, res) => {
  try {
    req.params.itemId = validateId(req.params.itemId);
    req.params.userId = validateId(req.params.userId);
    const { itemData } = req.body;
    const updateUser = await updateItemsForUser(
      req.params.userId,
      req.params.itemId,
      itemData
    );

    return res.json(updateUser);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.route("/getSuggestions").post(async (req, res) => {
  try {
    const response = await suggestRecipes(req.body.userId);
    return res.json(response);
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

router.route("/getItems/:userId").get(async (req, res) => {
  try {
    const items = await getItemsByUserId(req.params.userId);
    return res.json(items);
  } catch (error) {
    return res.status(404).json({ error: error.message });
  }
});

router.route("/getChats/:userId").get(async (req, res) => {
  try {
    const messages = await getChatsForUser(req.params.userId);
    return res.json({ messages });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

router.route("/chat").post(async (req, res) => {
  try {
    const { userId, message } = req.body;
    const response = await chatWithOpenAI(userId, message);
    return res.json({ response });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.route("/kpis/:userId").get(async (req, res) => {
  try {
    const kpis = await getKPIs(req.params.userId);
    return res.json(kpis);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
