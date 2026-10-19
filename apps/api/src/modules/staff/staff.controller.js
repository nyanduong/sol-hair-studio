import { getDatabaseStatus } from "../../config/database.js";
import { sendAuthError } from "../../middlewares/auth.js";
import { StaffError } from "./staff.service.js";

// Chuẩn hóa phản hồi lỗi của module staff theo envelope chung và đính kèm danh sách xung đột lịch hẹn nếu có.
export function sendStaffError(error, response, next) {
  if (error instanceof StaffError) {
    return response.status(error.status).json({
      status: "error",
      code: error.code,
      message: error.message,
      ...(error.conflicts ? { conflicts: error.conflicts } : {}),
    });
  }
  return sendAuthError(error, response, next);
}

// Tạo Express handler cho module staff: kiểm tra kết nối DB, validate body JSON object và lọc field theo allowlist.
export function staffHandler(operation, { status = 200, fields = null } = {}) {
  return async (request, response, next) => {
    response.set("Cache-Control", "no-store");
    if (getDatabaseStatus() !== "connected") {
      return response.status(503).json({
        status: "error",
        code: "DATABASE_UNAVAILABLE",
        message: "Cơ sở dữ liệu chưa sẵn sàng.",
      });
    }

    try {
      let input = {};
      if (fields !== null) {
        const body = request.body;
        if (
          body === undefined ||
          body === null ||
          typeof body !== "object" ||
          Array.isArray(body)
        ) {
          return response.status(400).json({
            status: "error",
            code: "INVALID_BODY",
            message: "Body phải là JSON object.",
          });
        }
        input = Object.fromEntries(
          fields
            .filter((key) => body[key] !== undefined)
            .map((key) => [key, body[key]]),
        );
        input.ip = request.ip;
      }

      const result = await operation({
        identity: request.identity,
        params: request.params,
        query: request.query,
        input,
      });

      return response.status(status).json({
        status: "success",
        data: result,
      });
    } catch (error) {
      return sendStaffError(error, response, next);
    }
  };
}
