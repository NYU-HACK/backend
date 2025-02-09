import axios from "axios";
import { products } from "../config/mongoCollections.js";

export const readQRCode = async (code) => {
  const productsCollection = await products();
  let prod = await productsCollection.findOne({
    code: code,
  });
  if (prod) return prod;

  const response = await axios.get(
    `https://world.openfoodfacts.org/api/v0/product/${code}.json`
  );
  if (response.data.status === 0) {
    throw new Error("Product not found");
  }

  const product = response.data.product;

  prod = {
    code: code,
    name: product.product_name || "Unknown",
    brand: product.brands || "Unknown",
    category: product.categories ? product.categories[0] : "Unknown",
  };

  const addProd = await productsCollection.insertOne(prod);

  return prod;
};
