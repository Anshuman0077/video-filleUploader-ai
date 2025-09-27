const errorHandler = (err, _req, res, _next) => {
  const statusCode = err.statusCode || 500;
  const isDev = process.env.NODE_ENV === 'development';

  console.error(err);

  res.status(statusCode).json({
    message: err.message || 'An unexpected error occurred',
    ...(isDev && { stack: err.stack }),
  });
};

export default errorHandler;