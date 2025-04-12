const mongoose = require("mongoose");
const crypto = require("crypto");
const express = require("express");

function onServerStart() {

    const wishListSchema = new mongoose.Schema({
        name: { type: String },
        price: { type: Number },
        link: { type: String },
        reserve: { type: Boolean },
        reserveby: [{ type: mongoose.Schema.Types.ObjectId, ref: 'users' }],
    });

  const userSchema = new mongoose.Schema({
    name: { type: String },
    password: { type: String },
    friendList: [{ type: mongoose.Schema.Types.ObjectId, ref: 'users' }],
    publicWishList: [wishListSchema],
    privateWishList: { type: Array },
    salt: { type: String },
    birthday: { type: String },
    email: { type: String },
    phone: { type: String },
    budget: { type: Number },
  });

  userSchema.pre("save", function (next) {
    if (this.isModified("password")) {
      this.salt = crypto.randomBytes(16).toString("hex");
      this.password = crypto
        .pbkdf2Sync(this.password, this.salt, 1000, 64, "sha512")
        .toString("hex");
    }
    next();
  });

  userSchema.methods.validPassword = function (password) {
    const hashedAttempt = crypto
      .pbkdf2Sync(password, this.salt, 1000, 64, "sha512")
      .toString("hex");
    console.log(this.name);
    return this.password === hashedAttempt;
  };

  const User = mongoose.model("users", userSchema);
const WishList = mongoose.model("wishlists", wishListSchema);
  return {User,WishList};
}

module.exports = {
  onServerStart,
};
