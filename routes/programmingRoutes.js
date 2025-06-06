const express = require('express');
const router = express.Router();
const {
  getProgrammingEnvs,
  getProgrammingEnvById,
  createProgrammingEnv,
  updateProgrammingEnv,
  deleteProgrammingEnv,
  executeCode,
  forkEnvironment,
  addCollaborator,
} = require('../controllers/programmingController');
const { protect } = require('../middlewares/authMiddleware');

// All routes are protected
router.use(protect);

// Programming environment routes
router.route('/')
  .get(getProgrammingEnvs)
  .post(createProgrammingEnv);

router.route('/:id')
  .get(getProgrammingEnvById)
  .put(updateProgrammingEnv)
  .delete(deleteProgrammingEnv);

// Execution routes
router.post('/:id/execute', executeCode);

// Collaboration routes
router.post('/:id/fork', forkEnvironment);
router.post('/:id/collaborators', addCollaborator);

module.exports = router;