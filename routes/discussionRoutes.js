const express = require('express');
const router = express.Router();
const {
  getDiscussions,
  getDiscussionById,
  createDiscussion,
  updateDiscussion,
  deleteDiscussion,
  addReply,
  updateReply,
  deleteReply,
  toggleLike,
} = require('../controllers/discussionController');
const { protect } = require('../middlewares/authMiddleware');

// All routes are protected
router.use(protect);

// Discussion routes
router.route('/')
  .get(getDiscussions)
  .post(createDiscussion);

router.route('/:id')
  .get(getDiscussionById)
  .put(updateDiscussion)
  .delete(deleteDiscussion);

// Reply routes
router.post('/:id/replies', addReply);
router.route('/:id/replies/:replyId')
  .put(updateReply)
  .delete(deleteReply);

// Like routes
router.post('/:id/like', toggleLike);

module.exports = router;