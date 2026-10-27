
const mongoose = require('mongoose');

const avatarSchema = new mongoose.Schema(
  {
    socketId: {
      type: String,
      required: true,
      unique: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },

    x: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    y: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    position: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
  },
  { timestamps: true }
);

// Coordinates represent virtual-office units, not GPS coordinates.
// Do not use MongoDB's 2dsphere distance calculations for these values.

module.exports = mongoose.model('Avatar', avatarSchema);
