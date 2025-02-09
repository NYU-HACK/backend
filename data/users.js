import dotenv from "dotenv";
dotenv.config();
import admin from "firebase-admin";
import { users, products, chats } from "../config/mongoCollections.js";
import { ObjectId } from "mongodb";
import {
  checkIsProperFirstOrLastName,
  validateEmail,
  checkIsProperPassword,
  validateId,
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
  manualEntry,
  price
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
    price: price,
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
  // Sort items by expiration date (earliest first)
  const sortedItems = refrigeratedItems.sort(
    (a, b) => new Date(a.expirationDate) - new Date(b.expirationDate)
  );

  // Format the sorted list
  let itemList = sortedItems
    .map((item) => {
      const quantity =
        typeof item.quantity === "number"
          ? item.quantity.toString()
          : item.quantity;
      return `- ${item.name} (${quantity}), Expires on: ${item.expirationDate}`;
    })
    .join("\n");

  return `I have the following ingredients in my refrigerator, **sorted by expiration date (soonest first)**:

${itemList}

### Task:
- Prioritize ingredients that are **expiring soon** when suggesting recipes.
- Suggest **3 recipes** that use the items listed, giving priority to the earliest expiring ones. Also if the items aren't matching please suggest to eat alone asap

### Return the response in JSON format like this:
\`\`\`json
[
  {
    "title": "Recipe Title",
    "ingredients": ["Ingredient 1", "Ingredient 2", ...],
    "instructions": ["Step 1", "Step 2", ...]
  }
]
\`\`\`

**Rules:**
- **Do not include extra text** outside the JSON response.
- Use **items with the nearest expiration date first** in recipes.
- Ensure each recipe contains a **title, ingredients, and step-by-step instructions**.
`;
};

export const getItemsByUserId = async (userId) => {
  userId = validateId(userId);
  const userCollection = await users();
  const user = userCollection.findOne({
    _id: ObjectId.createFromHexString(userId),
  });
  if (!user) throw new Error("User not found");

  return user.refrigeratedItems;
};

export const getChatsForUser = async (userId) => {
  userId = validateId(userId);

  const chatsCollection = await chats();

  const chatsForUser = await chatsCollection.findOne({
    userId: ObjectId.createFromHexString(userId),
  });

  return chatsForUser.messages || [];
};

export const chatWithOpenAI = async (userId, userPrompt) => {
  const chatsCollection = await chats();
  let userChat = await chatsCollection.findOne({
    userId: new ObjectId(userId),
  });

  if (!userChat) {
    userChat = { userId: new ObjectId(userId), messages: [] };
  }
  userChat.messages.push({
    role: "user",
    content: userPrompt,
    timestamp: new Date(),
  });

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: userChat.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    temperature: 0.7,
  });

  const aiReply = response.choices[0].message.content;

  userChat.messages.push({
    role: "assistant",
    content: aiReply,
    timestamp: new Date(),
  });

  const updateChat = await chatsCollection.findOneAndUpdate(
    { userId: new ObjectId(userId) },
    { $set: { messages: userChat.messages } },
    { upsert: true, returnDocument: "after" } // ✅ Options should be inside the third parameter
  );

  return updateChat.messages;
};

export const getKPIs = async (userId) => {
  userId = validateId(userId);
  const userCollection = await users();
  const user = await userCollection.findOne({
    _id: ObjectId.createFromHexString(userId),
  });
  const message = generateKPI_Prompt(user.refrigeratedItems);
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: message }],
    temperature: 0.7,
  });

  let rawText = response.choices[0].message.content.trim();
  console.log("Raw AI Response:\n", rawText);

  // Remove code block markers (```json ... ```)
  rawText = rawText.replace(/^```json\n/, "").replace(/\n```$/, "");

  try {
    const kpiData = JSON.parse(rawText);
    console.log("Parsed KPI Data:\n", kpiData);
    return kpiData;
  } catch (error) {
    console.error("JSON Parsing Error:", error);
    return {};
  }
};

const generateKPI_Prompt = (refrigeratedItems) => {
  const today = new Date();

  // Separate expired and non-expired items
  const expiredItems = [];
  const nonExpiredItems = [];

  refrigeratedItems.forEach((item) => {
    const expirationDate = new Date(item.expirationDate);
    const quantity =
      typeof item.quantity === "number"
        ? item.quantity.toString()
        : item.quantity;
    const price = item.price ? `$${item.price}` : "Unknown Price";

    const formattedItem = `- ${item.name} (${quantity}), Price: ${price}, Expiration: ${item.expirationDate}`;

    if (expirationDate < today) {
      expiredItems.push(formattedItem);
    } else {
      nonExpiredItems.push(formattedItem);
    }
  });

  return `I have the following food items in my refrigerator:

### 🛑 Expired Items:
${expiredItems.length > 0 ? expiredItems.join("\n") : "None"}

### ✅ Non-Expired Items:
${nonExpiredItems.length > 0 ? nonExpiredItems.join("\n") : "None"}

For below calculations, if you don't find price for any item, you may assume it based on industry standards in US and give me the KPIs based on calculations
Also be more accurate, include some trends totalFridgeValue should not be same as potential savings dont consider items exping within 2 days in potentialSavings
and similarly other metrics will change
### Task:
1. Calculate the **total value of expired items (wasted food cost)**.
2. Calculate the **total value of non-expired items**.
3. Estimate **potential savings if I use up the remaining food instead of wasting it**.
5. Suggest a **smart grocery budget for next month** based on past trends.
6. Estimate the **environmental impact (CO₂ emissions) of wasted food**.

**Return the response in JSON format** like this:
\`\`\`json
{
  "totalWastedValue": "Amount in dollars",
  "totalFridgeValue": "Amount in dollars",
  "potentialSavings": "Amount in dollars",
  "recommendedGroceryBudget": "Amount in dollars",
  "environmentalImpact": "CO2 waste in pounds"
}
\`\`\`

Do not include any extra text, just return structured JSON data. Include units in json data`;
};
