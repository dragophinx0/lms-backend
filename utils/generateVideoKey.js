/**
 * Generate a unique key for a video file
 * @param {string} userId - User ID
 * @param {string} originalFilename - Original filename
 * @returns {string} - Unique file key
 */
const generateVideoKey = (userId, originalFilename) => {
  const timestamp = Date.now();
  const extension = originalFilename.split('.').pop();
  return `videos/${userId}/${timestamp}.${extension}`;
};

module.exports = generateVideoKey;