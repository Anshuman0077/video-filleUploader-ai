  import { v2 as cloudinary } from 'cloudinary';
  import fs from 'fs';

  // Configure Cloudinary
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const uploadOnCloudinary = async (localFilePath) => {
    try {
      if (!localFilePath) return null;

      // Check if file exists
      if (!fs.existsSync(localFilePath)) {
        console.error('File does not exist:', localFilePath);
        return null;
      }

      // Upload the file to Cloudinary
      const response = await cloudinary.uploader.upload(localFilePath, {
        resource_type: 'video',
        folder: 'video-qa-uploads',
        use_filename: true,
        unique_filename: true,
        chunk_size: 6000000, // 6MB chunks for large files
      });

      console.log('✅ File uploaded to Cloudinary successfully:', response.secure_url);
      return response;

    } catch (error) {
      console.error('❌ Error uploading to Cloudinary:', error);
      return null;
    } finally {
      // Clean up local file after upload attempt
      try {
        if (fs.existsSync(localFilePath)) {
          fs.unlinkSync(localFilePath);
          console.log('🧹 Local file cleaned up:', localFilePath);
        }
      } catch (cleanupError) {
        console.warn('⚠️ Failed to cleanup local file:', cleanupError.message);
      }
    }
  };

  const deleteFromCloudinary = async (publicId) => {
    try {
      if (!publicId) return null;
      
      const response = await cloudinary.uploader.destroy(publicId, {
        resource_type: 'video'
      });
      
      console.log('🗑️ File deleted from Cloudinary:', publicId);
      return response;
    } catch (error) {
      console.error('❌ Error deleting from Cloudinary:', error);
      return null;
    }
  };

  export { uploadOnCloudinary, deleteFromCloudinary };