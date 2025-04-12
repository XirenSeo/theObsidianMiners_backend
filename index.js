require("dotenv").config();
const OpenAi = require("openai");
const mongoose = require("mongoose");
const express = require("express");
const cros = require("cors");
const app = express();
const mailer = require("nodemailer");
const URL = process.env.DATABASE_LINK;
const apiKey = process.env.DEEPSEEK_API_KEY;
const onServerStart = require("./utilities").onServerStart;
let User, WishList;
let userList;
let loginUser = null;

const openai = new OpenAi({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

async function fetchUserList() {
  userList = (await User.find({})) || [];
}

app.use(cros());

app.use(express.json());

mongoose
  .connect(URL)
  .then(() => {
    app.listen(3000, () => {
      const obj = onServerStart();
      User = obj.User;
      WishList = obj.WishList;

      fetchUserList();
      console.log("server is running");
    });
  })
  .catch((err) => {
    console.log(err);
  });

app.post("/user/register", async (req, res) => {
  const user = req.body;
  console.log(userList);
  userList.forEach((u) => {
    if (u.name === user.name) {
      res.status(400).json({ message: "User already exists" });
    }
  });

  const newUser = new User({
    name: user.name,
    password: user.password,
    frinedList: [],
    publicWishList: [],
    privateWishList: [],
    birthday: user.birthday,
    email: user.email || "",
    phone: user.phone || "",
  });

  await newUser
    .save()
    .then(() => {
      res.status(200).json({ message: "User created successfully" });
      fetchUserList();
    })
    .catch((err) => {
      console.log(err);
      res.status(500).json({ message: "Error creating user" });
    });
});

app.post("/user/login", async (req, res) => {
  try {
    const { name, password } = req.body;
    
    
    // Find a single user by username - not all users
    const foundUser = await User.findOne({ name: name });
    console.log(foundUser);
    if (!foundUser) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Check if password is valid
    if (foundUser.validPassword(password)) {
      // Don't send password or salt in the response
      
      return res.status(200).json({
        user: foundUser,
      });
    } else {
      return res.status(401).json({ message: "Invalid password" });
    }
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Server error during login" });
  }})

app.put("/user/addfriend", async (req, res) => {
  try {
    const { userId, friendId } = req.body;

    // Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(friendId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID format",
      });
    }

    // Convert string IDs to ObjectId
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const friendObjectId = new mongoose.Types.ObjectId(friendId);

    // Check if user exists and update friendList
    const updatedUser = await User.findByIdAndUpdate(
      userObjectId,
      { $addToSet: { friendList: friendObjectId } },
      { new: true } // Return the updated document
    );

    await User.findByIdAndUpdate(
      friendObjectId,
      { $addToSet: { friendList: userObjectId } },
      { new: true } // Return the updated document
    );

    fetchUserList();

    if (!updatedUser) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Friend added successfully",
      data: updatedUser,
    });
  } catch (error) {
    console.error("Error adding friend:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

app.get("/user/friendList/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      });
    }

    // Find user and populate their friendList
    const user = await User.findById(userId).populate({
      path: "friendList",
      select: "name email _id", // Only return safe fields, exclude password/salt
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      count: user.friendList.length,
      data: user.friendList,
    });
  } catch (error) {
    console.error("Error fetching friends:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
});

app.put("/user/addItem/:id", async (req, res) => {
  const item = req.body;
  const userId = req.params.id;

  const wishItem = {
    name: item.name,
    price: item.price,
    link: item.link,
    reserve: false,
    reserveby: [],
  };

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID format",
    });
  }
  let updatedUser;
  User.findById(userId)
    .then((user) => {
      user.publicWishList.push(wishItem);
      updatedUser = user.save();
    })
    .catch((err) => {
      console.error("Error:", err);
    });

  fetchUserList();

  res.status(200).json({
    success: true,
    message: "wish list added successfully",
    data: updatedUser,
  });
});

app.put("/user/reserve/:id", async (req, res) => {
  const userId = req.params.id;
  const { itemId, friendId } = req.body;

  try {
    const result = await User.updateOne(
      {
        _id: friendId,
        "publicWishList._id": itemId,
      },
      {
        $addToSet: {
          "publicWishList.$.reserveby": userId,
        },
        $set: {
          "publicWishList.$.reserve": true,
        },
      }
    );

    if (result.modifiedCount === 0) {
      console.log(
        "No updates made. Maybe the item was already reserved by this user."
      );
    } else {
      console.log("Reservation successful!");
      res.send("Reservation successful!");
    }
  } catch (err) {
    res.send("Error reserving item:", err);
  }
});


app.get("/user/friWishList/:id", async (req, res) => {
   
    try {
        // Step 1: Find the user by their ID
        const userId = req.params.id;
        const user = await User.findById(userId).populate('friendList', 'publicWishList');
    
        if (!user) {
          throw new Error('User not found');
        }
    
        // Step 2: Initialize an array to store all wishlists
        const allWishLists = [];
    
        // Step 3: Loop through each friend's wishlist
        for (let friend of user.friendList) {
          // friend.publicWishList contains their wishlist
          allWishLists.push(...friend.publicWishList);
        }
    
        // Step 4: Return the aggregated wishlists of all friends
        res.send(allWishLists);
      } catch (err) {
        res.send('Error fetching friends wishlists:', err);
         // Rethrow the error if needed
      }
})

app.get('/user/getAllUser', async (req, res) => {
  try {
    const users = await User.find({}, { password: 0, salt: 0 });
    res.status(200).json(users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Server error' });
  }
});