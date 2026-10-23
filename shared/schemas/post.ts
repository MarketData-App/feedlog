import { z } from 'zod/v4'

export const createPostSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
  content: z.string().trim().min(1, 'Content is required').max(10000, 'Content must be 10000 characters or less'),
  boardId: z.uuid().nullable().optional(),
})

// Author can edit title/content, admin can edit any field
export const updatePostSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be 200 characters or less').optional(),
  content: z.string().trim().min(1, 'Content is required').max(10000, 'Content must be 10000 characters or less').optional(),
  status: z.enum(['open', 'planned', 'in_progress', 'done', 'closed']).optional(),
  boardId: z.uuid().nullable().optional(),
})
