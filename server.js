require("dotenv").config();
const express = require("express");
const session = require("express-session");
const methodOverdrive = require("method-override");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcrypt");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const path = require("path");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const firebase = require("firebase/app");
const {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} = require("firebase/storage");

const app = express();

app.use(cors());
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(methodOverdrive("_method"));
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

const User = require("./models/userModel");
const Image = require("./models/imageModel");
const Segment = require("./models/segmentModel");

const { PORT, MONGO_URL } = process.env;

const firebaseConfig = {
  apiKey: process.env.API_KEY,
  authDomain: process.env.AUTH_DOMAIN,
  projectId: process.env.PROJECT_ID,
  storageBucket: process.env.STORAGE_BUCKET,
  messagingSenderId: process.env.MESSAGING_SENDER_ID,
  appId: process.env.APP_ID,
  measurementId: process.env.MEASUREMENT_ID,
};

firebase.initializeApp(firebaseConfig);
const storage = getStorage();

mongoose
  .connect(MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Successfully connected to MongoDB.");
  })
  .catch((error) => {
    console.error("Connection Error", error.message);
    process.exit();
  });

app.get("/", async (req, res) => {
  try {
    if (Image) {
      const Images = await Image.find({ title: { $ne: "top-image" } }).sort({
        order: 1,
      });
      const topImage = await Image.findOne({ title: "top-image" });
      console.log(topImage);
      const Segments = await Segment.find({});
      res.render("index.ejs", {
        images: Images,
        segments: Segments,
        topImage: topImage,
      });
    } else {
      res.render("index.ejs");
    }
  } catch (err) {
    console.log(err.message);
  }
});

app.get("/signup/", (req, res) => {
  res.render("signup.ejs");
});

app.post("/signup/", async (req, res) => {
  try {
    const checkEmail = await User.findOne({ email: req.body.email });
    if (checkEmail) {
      res.json({ message: "User Already Exists" });
    } else {
      passwordHash = await bcrypt.hash(req.body.password, 10);
      const user = new User({
        email: req.body.email,
        password: passwordHash,
      });

      await user.save();
      res.redirect("/");
    }
  } catch (err) {
    console.log(err.message);
  }
});

app.get("/login/", (req, res) => {
  res.render("login.ejs");
});

app.post("/login/", async (req, res) => {
  try {
    const email = req.body.email;
    const password = req.body.password;
    const userData = await User.findOne({ email: email });
    if (userData) {
      const passwordMatch = await bcrypt.compare(password, userData.password);
      if (passwordMatch) {
        const token = jwt.sign(
          {
            user: userData,
          },
          process.env.SECRET
        );

        // Store the token in the session
        req.session.token = token;

        res.redirect("/edit");
      } else {
        res.json({ message: "Email or Password are Incorrect!" });
      }
    } else {
      res.json({ message: "Email or Password are Incorrect!" });
    }
  } catch (err) {
    res.status(400).json(err.message);
    console.log(err.message);
  }
});

app.get("/signout", (req, res) => {
  res.clearCookie("token");
  res.redirect("/");
});

app.get("/edit", (req, res) => {
  const token = req.session.token;

  if (!token) {
    res.redirect("/login");
    return;
  }

  jwt.verify(token, process.env.SECRET, (err, decoded) => {
    if (err) {
      res.redirect("/login");
      return;
    }
    res.render("edit.ejs");
  });
});

app.get("/segments", async (req, res) => {
  const allsegments = await Segment.find({});
  res.render("segments.ejs", {
    segments: allsegments,
  });
});

app.post("/segments/", upload.single("image"), async (req, res) => {
  const image = req.file;

  if (!image) {
    return res.status(400).json({ message: "Please upload an image file." });
  }

  const storageRef = ref(storage, `segments/${image.originalname}`);

  try {
    const snapshot = await uploadBytes(storageRef, image.buffer);
    const downloadURL = await getDownloadURL(storageRef);

    const segment = new Segment({
      title: req.body.title,
      content: req.body.content,
      imageUrl: downloadURL,
    });

    await segment.save();

    res.redirect("/segments");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error uploading segment");
  }
});

app.get("/segments/edit/:id", async (req, res) => {
  try {
    const segment = await Segment.findById(req.params.id);

    res.render("edit_segment.ejs", {
      segment: segment,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Error retrieving segment");
  }
});

app.put("/segments/edit/:id", upload.single("image"), async (req, res) => {
  try {
    const segment = await Segment.findById(req.params.id);

    // Check if a new image was uploaded
    if (req.file) {
      const image = req.file;
      // const imageRef = ref(storage, `segments/${segment.imageUrl}`);
      // await imageRef.delete();
      // Set the new image URL
      const storageRef = ref(storage, `segments/${image.originalname}`);
      const snapshot = await uploadBytes(storageRef, image.buffer);
      const downloadURL = await getDownloadURL(storageRef);
      console.log(downloadURL);
      segment.title = req.body.title;
      segment.content = req.body.content;
      segment.imageUrl = downloadURL;
      await segment.save();
    } else {
      segment.title = req.body.title;
      segment.content = req.body.content;
      segment.imageUrl = segment.imageUrl;
      await segment.save();
    }

    console.log("Segment updated:", segment);
    res.redirect("/segments");
  } catch (error) {
    console.log(error);
    res.status(500).send("Error updating segment");
  }
});

app.delete("/segments/:id", async (req, res) => {
  try {
    // const segment = await Segment.findById(req.params.id);

    // const imageRef = ref(storage, `segments/${segment.imageUrl}`);
    // await deleteFromFirebase(imageRef);

    await Segment.findByIdAndRemove(req.params.id);

    console.log("Segment deleted");
    res.redirect("/segments");
  } catch (error) {
    console.log(error);
    res.status(500).send("Error deleting segment");
  }
});

app.get("/images/", async (req, res) => {
  const images = await Image.find({});
  res.render("images.ejs", {
    images: images,
  });
});

app.post("/images/", upload.single("image"), async (req, res) => {
  const newImage = req.file;

  if (!newImage) {
    return res.status(400).json({ message: "Please upload an image file." });
  }

  const storageRef = ref(storage, `images/${newImage.originalname}`);

  try {
    const snapshot = await uploadBytes(storageRef, newImage.buffer);
    const downloadURL = await getDownloadURL(storageRef);

    const image = new Image({
      title: req.body.title,
      name: req.body.name,
      order: req.body.order,
      imageUrl: downloadURL,
    });

    await image.save();

    res.redirect("/images");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error uploading image");
  }
});

app.delete("/images/delete/:id", async (req, res) => {
  try {
    // const image = await Segment.findById(req.params.id);

    // const imageRef = storage.ref(`segments/${image.imageUrl}`);
    // await imageRef.delete();

    await Image.findByIdAndRemove(req.params.id);

    console.log("Image deleted");
    res.redirect("/images");
  } catch (error) {
    console.log(error);
    res.status(500).send("Error deleting image");
  }
});

app.get("/images/:id/edit", async (req, res) => {
  try {
    const image = await Image.findById(req.params.id);

    res.render("edit_image.ejs", {
      image: image,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send("Error retrieving segment");
  }
});

app.post("/images/:id/edit", async (req, res) => {
  try {
    const imageEdit = await Image.findById(req.params.id);

    imageEdit.title = req.body.title;
    imageEdit.name = req.body.name;

    if (req.body.image) {
      imageEdit.imageUrl = req.body.image;
    } else {
      // No new image was uploaded, so keep the existing image
      imageEdit.imageUrl = imageEdit.imageUrl;
    }

    if (req.body.order) {
      imageEdit.order = req.body.order;
    } else {
      imageEdit.order = imageEdit.order;
    }

    await imageEdit.save();

    console.log("Image updated:", imageEdit);
    res.redirect("/images");
  } catch (error) {
    console.log(error);
    res.status(500).send("Error updating image");
  }
});

app.listen(PORT, () => {
  console.log(`Now listening on port ${PORT}`);
});
