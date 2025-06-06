const asyncHandler = require('express-async-handler');
const ProgrammingEnv = require('../models/programmingEnvModel');
const Course = require('../models/courseModel');
const Joi = require('joi');

/**
 * Get all programming environments with pagination
 * @route   GET /api/programming
 * @access  Private
 */
const getProgrammingEnvs = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const language = req.query.language;
  const courseId = req.query.courseId;
  const isPublic = req.query.isPublic;
  const isTemplate = req.query.isTemplate;
  const search = req.query.search;

  let filter = {};

  if (language) {
    filter.language = language;
  }

  if (courseId) {
    filter.course = courseId;
  }

  if (isPublic !== undefined) {
    filter.isPublic = isPublic === 'true';
  }

  if (isTemplate !== undefined) {
    filter.isTemplate = isTemplate === 'true';
  }

  if (search) {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tags: { $in: [new RegExp(search, 'i')] } }
    ];
  }

  // For non-public environments, only show user's own or public ones
  if (!filter.isPublic) {
    filter.$or = [
      { user: req.user._id },
      { isPublic: true },
      { 'collaborators.user': req.user._id }
    ];
  }

  const environments = await ProgrammingEnv.find(filter)
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('user', 'name email')
    .populate('course', 'title')
    .populate('collaborators.user', 'name email')
    .select('-code -executions');

  const total = await ProgrammingEnv.countDocuments(filter);

  res.json({
    environments,
    page,
    pages: Math.ceil(total / limit),
    total,
    hasNextPage: page < Math.ceil(total / limit),
    hasPrevPage: page > 1,
  });
});

/**
 * Get programming environment by ID
 * @route   GET /api/programming/:id
 * @access  Private
 */
const getProgrammingEnvById = asyncHandler(async (req, res) => {
  const environment = await ProgrammingEnv.findById(req.params.id)
    .populate('user', 'name email')
    .populate('course', 'title')
    .populate('collaborators.user', 'name email')
    .populate('parentEnv', 'title user');

  if (!environment) {
    res.status(404);
    throw new Error('Programming environment not found');
  }

  // Check permissions
  const isOwner = environment.user._id.toString() === req.user._id.toString();
  const isCollaborator = environment.collaborators.some(
    collab => collab.user._id.toString() === req.user._id.toString()
  );
  const canAccess = isOwner || isCollaborator || environment.isPublic;

  if (!canAccess) {
    res.status(403);
    throw new Error('Not authorized to access this environment');
  }

  res.json(environment);
});

/**
 * Create a new programming environment
 * @route   POST /api/programming
 * @access  Private
 */
const createProgrammingEnv = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string(),
    language: Joi.string().valid('javascript', 'python', 'java', 'cpp', 'c', 'html', 'css').required(),
    code: Joi.string().default(''),
    courseId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
    isPublic: Joi.boolean(),
    isTemplate: Joi.boolean(),
    tags: Joi.array().items(Joi.string()),
    parentEnvId: Joi.string().regex(/^[0-9a-fA-F]{24}$/),
    settings: Joi.object({
      theme: Joi.string().valid('light', 'dark'),
      fontSize: Joi.number().min(8).max(24),
      autoSave: Joi.boolean(),
      showLineNumbers: Joi.boolean()
    })
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const { courseId, parentEnvId, ...envData } = req.body;

  // Verify course exists if courseId is provided
  if (courseId) {
    const course = await Course.findById(courseId);
    if (!course) {
      res.status(404);
      throw new Error('Course not found');
    }
  }

  // Verify parent environment exists if parentEnvId is provided
  if (parentEnvId) {
    const parentEnv = await ProgrammingEnv.findById(parentEnvId);
    if (!parentEnv) {
      res.status(404);
      throw new Error('Parent environment not found');
    }

    // Add to parent's forks
    parentEnv.forks.push({ user: req.user._id });
    await parentEnv.save();
  }

  const environment = await ProgrammingEnv.create({
    ...envData,
    user: req.user._id,
    ...(courseId && { course: courseId }),
    ...(parentEnvId && { parentEnv: parentEnvId }),
  });

  const populatedEnv = await ProgrammingEnv.findById(environment._id)
    .populate('user', 'name email')
    .populate('course', 'title');

  res.status(201).json(populatedEnv);
});

/**
 * Update programming environment
 * @route   PUT /api/programming/:id
 * @access  Private
 */
const updateProgrammingEnv = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string(),
    description: Joi.string(),
    code: Joi.string(),
    isPublic: Joi.boolean(),
    isTemplate: Joi.boolean(),
    tags: Joi.array().items(Joi.string()),
    settings: Joi.object({
      theme: Joi.string().valid('light', 'dark'),
      fontSize: Joi.number().min(8).max(24),
      autoSave: Joi.boolean(),
      showLineNumbers: Joi.boolean()
    })
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const environment = await ProgrammingEnv.findById(req.params.id);

  if (!environment) {
    res.status(404);
    throw new Error('Programming environment not found');
  }

  // Check permissions
  const isOwner = environment.user.toString() === req.user._id.toString();
  const hasWriteAccess = environment.collaborators.some(
    collab => collab.user.toString() === req.user._id.toString() && 
    ['write', 'admin'].includes(collab.permission)
  );

  if (!isOwner && !hasWriteAccess) {
    res.status(403);
    throw new Error('Not authorized to update this environment');
  }

  const updatedEnv = await ProgrammingEnv.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  ).populate('user', 'name email').populate('course', 'title');

  res.json(updatedEnv);
});

/**
 * Delete programming environment
 * @route   DELETE /api/programming/:id
 * @access  Private
 */
const deleteProgrammingEnv = asyncHandler(async (req, res) => {
  const environment = await ProgrammingEnv.findById(req.params.id);

  if (!environment) {
    res.status(404);
    throw new Error('Programming environment not found');
  }

  // Check ownership
  if (environment.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to delete this environment');
  }

  await environment.deleteOne();

  res.json({ message: 'Programming environment removed' });
});

/**
 * Execute code in programming environment
 * @route   POST /api/programming/:id/execute
 * @access  Private
 */
const executeCode = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    code: Joi.string().required(),
    input: Joi.string().default('')
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const environment = await ProgrammingEnv.findById(req.params.id);

  if (!environment) {
    res.status(404);
    throw new Error('Programming environment not found');
  }

  // Check permissions
  const isOwner = environment.user.toString() === req.user._id.toString();
  const hasAccess = environment.collaborators.some(
    collab => collab.user.toString() === req.user._id.toString()
  ) || environment.isPublic;

  if (!isOwner && !hasAccess) {
    res.status(403);
    throw new Error('Not authorized to execute code in this environment');
  }

  const { code, input } = req.body;

  try {
    // This is a simplified execution simulation
    // In a real implementation, you would use a secure code execution service
    let output = '';
    let error = null;
    let status = 'success';
    const startTime = Date.now();

    // Simulate code execution based on language
    switch (environment.language) {
      case 'javascript':
        try {
          // Very basic JavaScript execution (unsafe - for demo only)
          output = 'JavaScript execution simulated';
        } catch (err) {
          error = err.message;
          status = 'error';
        }
        break;
      
      case 'python':
        output = 'Python execution simulated';
        break;
      
      case 'html':
        output = 'HTML rendered successfully';
        break;
      
      case 'css':
        output = 'CSS compiled successfully';
        break;
      
      default:
        output = `${environment.language} execution simulated`;
    }

    const executionTime = Date.now() - startTime;

    // Create execution record
    const execution = {
      code,
      language: environment.language,
      input,
      output,
      error,
      executionTime,
      status
    };

    environment.executions.push(execution);
    environment.lastExecuted = new Date();
    environment.executionCount += 1;

    // Keep only last 10 executions
    if (environment.executions.length > 10) {
      environment.executions = environment.executions.slice(-10);
    }

    await environment.save();

    res.json({
      output,
      error,
      executionTime,
      status
    });

  } catch (err) {
    res.status(500);
    throw new Error(`Code execution failed: ${err.message}`);
  }
});

/**
 * Fork programming environment
 * @route   POST /api/programming/:id/fork
 * @access  Private
 */
const forkEnvironment = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    description: Joi.string()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const originalEnv = await ProgrammingEnv.findById(req.params.id);

  if (!originalEnv) {
    res.status(404);
    throw new Error('Programming environment not found');
  }

  // Check if environment can be forked
  if (!originalEnv.isPublic && originalEnv.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Cannot fork private environment');
  }

  // Create forked environment
  const forkedEnv = await ProgrammingEnv.create({
    title: req.body.title,
    description: req.body.description,
    language: originalEnv.language,
    code: originalEnv.code,
    user: req.user._id,
    parentEnv: originalEnv._id,
    settings: originalEnv.settings,
    tags: originalEnv.tags
  });

  // Add fork record to original environment
  originalEnv.forks.push({ user: req.user._id });
  await originalEnv.save();

  const populatedEnv = await ProgrammingEnv.findById(forkedEnv._id)
    .populate('user', 'name email')
    .populate('parentEnv', 'title user');

  res.status(201).json(populatedEnv);
});

/**
 * Add collaborator to environment
 * @route   POST /api/programming/:id/collaborators
 * @access  Private
 */
const addCollaborator = asyncHandler(async (req, res) => {
  const schema = Joi.object({
    userId: Joi.string().regex(/^[0-9a-fA-F]{24}$/).required(),
    permission: Joi.string().valid('read', 'write', 'admin').default('read')
  });

  const { error } = schema.validate(req.body);
  if (error) {
    res.status(400);
    throw new Error(error.details[0].message);
  }

  const environment = await ProgrammingEnv.findById(req.params.id);

  if (!environment) {
    res.status(404);
    throw new Error('Programming environment not found');
  }

  // Check ownership
  if (environment.user.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to add collaborators');
  }

  const { userId, permission } = req.body;

  // Check if user is already a collaborator
  const existingCollaborator = environment.collaborators.find(
    collab => collab.user.toString() === userId
  );

  if (existingCollaborator) {
    res.status(400);
    throw new Error('User is already a collaborator');
  }

  environment.collaborators.push({
    user: userId,
    permission
  });

  await environment.save();

  const populatedEnv = await ProgrammingEnv.findById(environment._id)
    .populate('collaborators.user', 'name email');

  res.json(populatedEnv);
});

module.exports = {
  getProgrammingEnvs,
  getProgrammingEnvById,
  createProgrammingEnv,
  updateProgrammingEnv,
  deleteProgrammingEnv,
  executeCode,
  forkEnvironment,
  addCollaborator,
};