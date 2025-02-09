//YOU WILL NEED TO CHANGE THE DB NAME TO MATCH THE REQUIRED DB NAME IN THE ASSIGNMENT SPECS!!!
import dotenv from "dotenv";
dotenv.config();

export const mongoConfig = {
  serverUrl: process.env.mongo_uri,
  database: "food-wallet",
};
