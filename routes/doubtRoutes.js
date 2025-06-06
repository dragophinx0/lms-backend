const express = require('express');
const router = express.Router();
const {
  getDoubts,
  getDoubtById,
  createDoubt,
  updateDoubt,
  deleteDoubt,
  addResponse,
  resolveDoubt,
  toggleUpvote,
} = require('../controllers/doubtController');
const { protect } = require('../middlewares/authMiddleware');

// All routes are protected
router.use(protect);

// Doubt routes
router.route('/')
  .get(getDoubts)
  .post(createDoubt);

router.route('/:id')
  .get(getDoubtById)
  .put(updateDoubt)
  .delete(deleteDoubt);

// Response routes
router.post('/:id/responses', addResponse);

// Action routes
router.put('/:id/resolve', resolveDoubt);
router.post('/:id/upvote', toggleUpvote);

module.exports = router;