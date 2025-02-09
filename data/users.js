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
const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK || "{}");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
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
