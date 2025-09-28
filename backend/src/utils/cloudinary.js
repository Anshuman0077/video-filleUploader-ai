import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import { promisify } from 'util';
import path from 'path';

// Enhanced configuration validation
const validateCloudinaryConfig = () => {
  const requiredConfig = ['cloud_name', 'api_key', 'api_secret'];
  const missing = requiredConfig.filter(key => !process.env[`CLOUDINARY_${key.toUpperCase()}`]);

  if (missing.length > 0) {
    throw new Error(`Missing Cloudinary configuration: ${missing.join(', ')}`);
  }

  // Validate configuration values
  const config = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  };

  if (!config.cloud_name || config.cloud_name.length < 3) {
    throw new Error('Invalid Cloudinary cloud name');
  }

  if (!config.api_key || config.api_key.length < 10) {
    throw new Error('Invalid Cloudinary API key');
  }

  if (!config.api_secret || config.api_secret.length < 10) {
    throw new Error('Invalid Cloudinary API secret');
  }

  return config;
};

// Configure Cloudinary with validated configuration
try {
  const config = validateCloudinaryConfig();
  cloudinary.config(config);
  console.log('✅ Cloudinary configured successfully');
} catch (error) {
  console.error('❌ Cloudinary configuration error:', error.message);
  throw error;
}

const unlinkAsync = promisify(fs.unlink);
const statAsync = promisify(fs.stat);

// Enhanced file validation before upload
const validateLocalFile = async (localFilePath) => {
  if (!localFilePath) {
    throw new Error('Local file path is required');
  }

  // Check if file exists and is accessible
  try {
    await statAsync(localFilePath);
  } catch (error) {
    throw new Error(`File not accessible: ${localFilePath} - ${error.message}`);
  }

  // Check file size
  const stats = await statAsync(localFilePath);
  if (stats.size === 0) {
    throw new Error('File is empty');
  }

  const maxSize = 500 * 1024 * 1024; // 500MB
  if (stats.size > maxSize) {
    throw new Error(`File size ${(stats.size / (1024 * 1024)).toFixed(2)}MB exceeds maximum allowed size 500MB`);
  }

  // Basic file type validation by extension
  const allowedExtensions = ['.mp4', '.mpeg', '.mov', '.avi', '.wmv', '.flv', '.webm', '.mkv'];
  const fileExtension = path.extname(localFilePath).toLowerCase();
  
  if (!allowedExtensions.includes(fileExtension)) {
    throw new Error(`Unsupported file extension: ${fileExtension}`);
  }

  return stats;
};

// Enhanced upload function with retry logic and progress tracking
const uploadOnCloudinary = async (localFilePath, options = {}) => {
  let response = null;

  try {
    // Validate local file before upload
    const fileStats = await validateLocalFile(localFilePath);
    console.log(`📤 Preparing to upload file: ${path.basename(localFilePath)} (${(fileStats.size / (1024 * 1024)).toFixed(2)}MB)`);

    const uploadOptions = {
      resource_type: 'video',
      folder: 'video-qa-uploads',
      use_filename: true,
      unique_filename: true,
      chunk_size: 6000000, // 6MB chunks for large files
      timeout: 120000, // 2 minutes timeout
      ...options
    };

    // Retry configuration
    const maxRetries = 3;
    const baseDelay = 2000; // 2 seconds
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Upload attempt ${attempt}/${maxRetries} for ${path.basename(localFilePath)}`);
        
        response = await cloudinary.uploader.upload(localFilePath, uploadOptions);

        if (response && response.secure_url) {
          console.log(`✅ File uploaded successfully on attempt ${attempt}:`, {
            publicId: response.public_id,
            size: response.bytes,
            duration: response.duration,
            format: response.format
          });
          break; // Success, break out of retry loop
        } else {
          throw new Error('Cloudinary response missing secure_url');
        }

      } catch (uploadError) {
        lastError = uploadError;
        console.warn(`⚠️ Upload attempt ${attempt} failed:`, uploadError.message);

        if (attempt < maxRetries) {
          // Exponential backoff with jitter
          const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
          console.log(`⏳ Retrying in ${Math.round(delay / 1000)} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    if (!response) {
      throw lastError || new Error('Cloudinary upload failed after all retry attempts');
    }

    // Validate response
    if (!response.public_id || !response.secure_url) {
      throw new Error('Invalid response from Cloudinary: missing public_id or secure_url');
    }

    return response;

  } catch (error) {
    console.error('❌ Error uploading to Cloudinary:', {
      error: error.message,
      file: localFilePath ? path.basename(localFilePath) : 'unknown',
      timestamp: new Date().toISOString()
    });
    
    throw error; // Re-throw to let caller handle
  } finally {
    // Enhanced cleanup: only delete if upload was successful or if we're not keeping files
    if (localFilePath) {
      try {
        if (fs.existsSync(localFilePath)) {
          // Only delete if upload was successful or if we have a specific policy
          if (response && response.secure_url) {
            await unlinkAsync(localFilePath);
            console.log('🧹 Local file cleaned up after successful upload:', path.basename(localFilePath));
          } else {
            console.log('💾 Keeping local file due to upload failure:', path.basename(localFilePath));
            // In production, you might want to move failed uploads to a different directory
          }
        }
      } catch (cleanupError) {
        console.warn('⚠️ Failed to cleanup local file:', cleanupError.message);
        
        // Schedule retry for cleanup
        setTimeout(() => {
          try {
            if (fs.existsSync(localFilePath)) {
              fs.unlinkSync(localFilePath);
              console.log('✅ Retry cleanup successful for:', path.basename(localFilePath));
            }
          } catch (retryError) {
            console.error('❌ Retry cleanup failed:', retryError.message);
          }
        }, 5000);
      }
    }
  }
};

// Enhanced delete function with validation
const deleteFromCloudinary = async (publicId, options = {}) => {
  try {
    if (!publicId || typeof publicId !== 'string') {
      throw new Error('Public ID is required and must be a string');
    }

    // Validate public ID format (basic check)
    if (publicId.includes('..') || publicId.includes('/')) {
      throw new Error('Invalid public ID format');
    }

    const deleteOptions = {
      resource_type: 'video',
      invalidate: true, // Invalidate CDN cache
      ...options
    };

    const response = await cloudinary.uploader.destroy(publicId, deleteOptions);
    
    if (response.result !== 'ok') {
      throw new Error(`Cloudinary deletion failed: ${response.result}`);
    }
    
    console.log('🗑️ File deleted from Cloudinary:', publicId);
    return response;

  } catch (error) {
    console.error('❌ Error deleting from Cloudinary:', {
      error: error.message,
      publicId: publicId,
      timestamp: new Date().toISOString()
    });
    
    // Don't throw for deletion errors in some cases (e.g., file already deleted)
    if (error.message.includes('not found')) {
      console.warn('⚠️ File not found during deletion, may have been already removed');
      return { result: 'not found' };
    }
    
    throw error;
  }
};

// Utility function to check if a resource exists
const checkResourceExists = async (publicId) => {
  try {
    const result = await cloudinary.api.resource(publicId, { resource_type: 'video' });
    return !!result;
  } catch (error) {
    if (error.message.includes('not found')) {
      return false;
    }
    throw error;
  }
};

// Utility function to get resource info
const getResourceInfo = async (publicId) => {
  try {
    return await cloudinary.api.resource(publicId, { 
      resource_type: 'video',
      image_metadata: true,
      colors: true
    });
  } catch (error) {
    console.error('Error getting resource info:', error.message);
    return null;
  }
};

// Health check function
const healthCheck = async () => {
  try {
    // Simple ping to Cloudinary by trying to list resources (limited to 1)
    await cloudinary.api.resources({ 
      resource_type: 'video',
      max_results: 1 
    });
    return { status: 'healthy', message: 'Cloudinary is accessible' };
  } catch (error) {
    return { status: 'unhealthy', message: error.message };
  }
};

export { 
  uploadOnCloudinary, 
  deleteFromCloudinary, 
  checkResourceExists, 
  getResourceInfo,
  healthCheck 
};