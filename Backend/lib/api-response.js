export const sendResponse = ({
  res,
  data,
  message = "Request successful",
  statusCode = 200,
  success,
}) => {
  return res.status(statusCode).json({
    success,
    message,
    data: data ?? null,
  });
};
