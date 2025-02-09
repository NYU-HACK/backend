import dotenv from "dotenv";
dotenv.config();
import admin from "firebase-admin";
import { users, products } from "../config/mongoCollections.js";
import { ObjectId, ReturnDocument } from "mongodb";
import {
  checkIsProperFirstOrLastName,
  validateEmail,
  checkIsProperPassword,
} from "../helpers.js";
import OpenAI from "openai";

dotenv.config();
const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK || "{}");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const auth = admin.auth();

export const insertUser = async (firstName, lastName, email, password) => {
  firstName = checkIsProperFirstOrLastName(firstName, "First Name");
  lastName = checkIsProperFirstOrLastName(lastName, "Last Name");
  email = validateEmail(email);
  password = checkIsProperPassword(password);

  const user = await auth.createUser({
    email,
    password,
  });

  const userCollection = await users();
  const createdUser = await userCollection.insertOne({
    firstName: firstName,
    lastName: lastName,
    email: email,
    refrigeratedItems: [],
  });
  if (createdUser.acknowledged) return { signUpSuccessful: true };
};

export const addItemToUser = async (
  userId,
  code,
  name,
  brand,
  category,
  quantity,
  expirationDate,
  manualEntry
) => {
  const userCollection = await users();
  const user = await userCollection.findOne({
    _id: ObjectId.createFromHexString(userId),
  });

  if (!user) throw new Error("User not found");

  if (manualEntry) {
    const productsCollection = await products();
    const newProd = await productsCollection.insertOne({
      code: code,
      name: name,
      brand: brand,
      category: category,
    });
  }

  user.refrigeratedItems.push({
    _id: new ObjectId(),
    code: code,
    name: name,
    brand: brand,
    category: category,
    quantity: quantity,
    expirationDate: expirationDate,
  });

  const updateUser = await userCollection.findOneAndUpdate(
    {
      _id: user._id,
    },
    {
      $set: user,
    },
    { returnDocument: "after" }
  );

  return updateUser;
};

export const removeItemFromUser = async (userId, itemId) => {
  const userCollection = await users();
  const user = await userCollection.findOne({
    _id: ObjectId.createFromHexString(userId),
  });

  const newArr = [];

  for (let item of user.refrigeratedItems) {
    if (item._id.toString() !== itemId) {
      newArr.push(item);
    }
  }
  user.refrigeratedItems = newArr;

  const updateUser = await userCollection.findOneAndUpdate(
    {
      _id: user._id,
    },
    {
      $set: user,
    },
    { returnDocument: "after" }
  );

  return updateUser;
};

export const updateItemsForUser = async (userId, itemId, itemData) => {
  const userCollection = await users();

  // Convert userId and itemId to ObjectId
  const userObjectId = ObjectId.createFromHexString(userId);
  const itemObjectId = ObjectId.createFromHexString(itemId);

  // Find the user
  const user = await userCollection.findOne({ _id: userObjectId });

  if (!user) {
    throw new Error("User not found");
  }

  // Find the index of the item in refrigeratedItems
  const itemIndex = user.refrigeratedItems.findIndex(
    (item) => item._id.toString() === itemObjectId.toString()
  );

  if (itemIndex === -1) {
    throw new Error("Item not found");
  }

  // Update the item
  user.refrigeratedItems[itemIndex] = {
    ...user.refrigeratedItems[itemIndex],
    ...itemData,
  };

  // Update the database
  const updatedUser = await userCollection.findOneAndUpdate(
    { _id: userObjectId },
    { $set: { refrigeratedItems: user.refrigeratedItems } },
    {
      returnDocument: "After",
    }
  );

  return updatedUser;
};

export const verifyToken = async (token) => {
  const decodedToken = await auth.verifyIdToken(token);
  if (!decodedToken) throw new Error("Invalid Token");

  const email = decodedToken.email;

  const userCollection = await users();

  const user = await userCollection.findOne({ email: email });
  return {
    message: "Token verified successfully",
    _id: user._id,
    name: `${user.firstName} ${user.lastName}`,
    email,
  };
};

export const suggestRecipes = async (userId) => {
  const userCollection = await users();
  const user = await userCollection.findOne({
    _id: ObjectId.createFromHexString(userId),
  });

  if (!user || !user.refrigeratedItems.length) {
    throw new Error("No refrigerated items found for the user.");
  }

  const message = generatePrompt(user.refrigeratedItems);
  console.log("Generated Prompt:\n", message);

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: message }],
    temperature: 0.7,
  });

  // Extract only the JSON response from the AI output
  let rawText = response.choices[0].message.content.trim();
  console.log("Raw AI Response:\n", rawText);

  // Remove code block markers (```json ... ```)
  rawText = rawText.replace(/^```json\n/, "").replace(/\n```$/, "");

  try {
    const recipes = JSON.parse(rawText);
    console.log("Parsed Recipes:\n", recipes);
    return recipes;
  } catch (error) {
    console.error("JSON Parsing Error:", error);
    return [];
  }
};

const parseToList = (text) => {
  const recipes = [];

  // Match recipe titles, ingredients, and instructions
  const recipeRegex =
    /### Recipe \d+: (.*?)\n\n\*\*Ingredients:\*\*\n(.*?)\n\n\*\*Instructions:\*\*\n([\s\S]*?)(?=\n\n### Recipe \d+:|\n\n?$)/g;

  let match;
  while ((match = recipeRegex.exec(text)) !== null) {
    const [, title, ingredientsRaw, instructionsRaw] = match;

    // Split ingredients into an array
    const ingredients = ingredientsRaw
      .split("\n")
      .map((item) => item.replace(/^- /, "").trim()) // Remove leading "-"
      .filter((item) => item.length > 0);

    // Split instructions into an array
    const instructions = instructionsRaw
      .split("\n")
      .map((step) => step.replace(/^\d+\.\s*/, "").trim()) // Remove leading numbers
      .filter((step) => step.length > 0);

    recipes.push({ title: title.trim(), ingredients, instructions });
  }

  return recipes;
};

const generatePrompt = (refrigeratedItems) => {
  let itemList = refrigeratedItems
    .map((item) => {
      // Convert quantity to string if it's a number
      const quantity =
        typeof item.quantity === "number"
          ? item.quantity.toString()
          : item.quantity;
      return `- ${item.name} (${quantity})`;
    })
    .join("\n");

  return `I have the following ingredients in my refrigerator:

${itemList}

Based on these ingredients, suggest 3 recipes I can make. 

**Return the response in JSON format** with the following structure:
\`\`\`json
[
  {
    "title": "Recipe Title",
    "ingredients": ["Ingredient 1", "Ingredient 2", ...],
  }
]
\`\`\`

Ensure that each recipe contains a **title, ingredients, and instructions**. Do not include any extra text or explanations outside the JSON format.`;
};
