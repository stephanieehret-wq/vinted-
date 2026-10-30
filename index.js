const express = require("express");
const mongoose = require("mongoose");
const uid2 = require("uid2");
const SHA256 = require("crypto-js/sha256");

const encBase64 = require("crypto-js/enc-base64");
const app = express();
app.use(express.json());
mongoose.connect("mongodb://localhost:27017/vinted");

const User = mongoose.model("User", {
  email: String,
  account: {
    username: String,
    avatar: Object,
  },
  newsletter: Boolean,
  token: String,
  hash: String,
  salt: String,
});
const Offer = mongoose.model("Offer", {
  product_name: String,
  product_description: String,
  product_price: Number,
  product_details: Array,
  product_image: Object,
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
});
app.get("/", (req, res) => {
  try {
    return res.status(200).json("Welcome on vinted");
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/user/signup", async (req, res) => {
  try {
    if (!req.body.username || !req.body.email) {
      return res.status(400).json({
        message: "Bad request",
      });
    }
    const existingUsername = await User.findOne({
      "account.username": req.body.username,
    });
    if (existingUsername) {
      return res.status(400).json({
        message: "user already exists",
      });
    }
    const salt = uid2(48);
    const token = uid2(36);
    const hash = encBase64.stringify(SHA256(req.body.password + salt));
    const saltedPassword = req.body.password + salt;
    const cryptedSaltedPassword = SHA256(saltedPassword);
    const newUser = new User({
      email: req.body.email,
      account: {
        username: req.body.username,
        avatar: req.body.avatar,
      },
      newsletter: req.body.newsletter,
      token: token,
      salt: salt,
      hash: hash,
    });

    await newUser.save();
    return res.status(201).json({
      _id: newUser._id,
      token: newUser.token,
      account: newUser.account,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.post("/user/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }
    console.log(user);
    const newHash = encBase64.stringify(SHA256(req.body.password + user.salt));
    console.log(newHash);
    console.log(user.hash);
    if (newHash === user.hash) {
      return res.status(200).json({
        _id: user._id,
        token: user.token,
        username: user.account.username,
      });
    } else {
      return res.status(401).json({ message: "Unauthorized" });
    }
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
const fileUpload = require("express-fileupload");
const cloudinary = require("cloudinary").v2;
cloudinary.config({
  cloud_name: "k863xqi9",
  api_key: 394533472521398,
  api_secret: "51DMGmHcbkzScsHofooUE3AWges",
});
const convertToBase64 = (file) => {
  return `data:${file.mimetype};base64,${file.data.toString("base64")}`;
};
app.post("/offer/publish", fileUpload(), async (req, res) => {
  try {
    console.log(req.body);
    const token = req.headers.authorization.replace("Bearer ", "");
    if (!token) {
      return res.status(401).json({ message: "Unautorized profil" });
    }
    const authorizedUser = await User.findOne({ token: token });
    if (!authorizedUser) {
      return res.status(41).json({ message: "Unautorized profil" });
    }
    if (!req.files || !req.files.picture) {
      return res.status(400).json({ message: "no image" });
    }
    const base64Picture = convertToBase64(req.files.picture);

    const uploadREsult = await cloudinary.uploader.upload(base64Picture);
    const newOffer = new Offer({
      product_name: req.body.title,
      product_description: req.body.description,
      product_price: req.body.price,
      product_details: [
        { MARQUE: req.body.brand },
        { TAILLE: req.body.size },
        { ÉTAT: req.body.condition },
        { COULEUR: req.body.color },
        { EMPLACEMENT: req.body.city },
      ],
      product_image: {
        secure_url: uploadREsult.secure_url,
      },
      owner: authorizedUser._id,
    });

    console.log(newOffer);
    await newOffer.save();
    await newOffer.populate({ path: "owner", select: "account" });

    return res.status(200).json({ message: newOffer });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
//route get en parametres query
app.get("/offers", async (req, res) => {
  try {
    const { title, priceMin, priceMax, sort, page } = req.query;
    // gestion des filters
    const filters = {};

    if (title) {
      filters.product_name = new RegExp(title, "i");
    }
    if (priceMin || priceMax) {
      filters.product_price = {};
    }
    if (priceMin) {
      filters.product_price.$gte = priceMin;
    }
    if (priceMax) {
      filters.product_price.$lte = priceMax;

      //gestion du tri
    }
    const sortObj = {};
    if (sort === "price-desc") {
      sortObj = { product_price: -1 };
    } else if (sort === "price-asc") {
      sortObj = { product_price: 1 };
    }
    // Gestion de la pagination
    const limit = 5;
    const pageNumber = Math.max(1, Number(page) || 1);
    const skip = (pageNumber - 1) * limit;

    //recherche dans la base de données
    const offers = await Offer.find(filters)
      .sort(sortObj)
      .skip(skip)
      .limit(limit);
    const count = await Offer.countDocuments(filters);
    return res.status(200).json({ count: count, offers: offers });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});
app.get("/offers/:id", async (req, res) => {
  try {
    const offerSearch = await Offer.findById(req.params.id);

    if (!offerSearch) {
      return res.status(404).json({ message: "Offer not found" });
    }
    return res.status(200).json(offerSearch);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

app.all(/.*/, (req, res) => {
  return res.status(404).json("Not found");
});

app.listen(3000, () => {
  console.log("Server started ");
});
