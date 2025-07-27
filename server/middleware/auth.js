import { clerkClient } from "@clerk/express";

export const protectAdmin = async (req, res, next) => {
  try {
    const { userId } = req.auth();
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return res.json({ success: false, message: "No valid userId found in request." });
    }

    const user = await clerkClient.users.getUser(userId);
    const role = user?.privateMetadata?.role;

    if (role !== 'admin') {
      return res.json({ success: false, message: "not authorized" });
    }

    next();
  } catch (error) {
    return res.json({ success: false, message: "not authorized" });
  }
};
