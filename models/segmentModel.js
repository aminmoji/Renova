const mongoose = require("mongoose");

const segmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    content: { type: String, required: true },
    imageUrl: { type: String, required: true },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

const Segment = mongoose.model("Segment", segmentSchema);

module.exports = Segment;
