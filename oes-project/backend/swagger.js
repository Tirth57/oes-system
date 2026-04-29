const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Online Examination System API',
      version: '1.0.0',
      description: `
## Online Examination System (OES) REST API

A comprehensive API for managing digital examinations with role-based access control.

### Roles
- **Student**: Register, take exams, view results
- **Examiner**: Create questions, schedule exams, grade answers, view reports
- **Administrator**: Manage users, system settings, full access

### Authentication
All protected endpoints require a JWT token in the \`Authorization: Bearer <token>\` header.
      `,
      contact: { name: 'OES Support', email: 'support@oes.edu' },
      license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
    },
    servers: [
      { url: 'http://localhost:5000', description: 'Development Server' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string', format: 'email' },
            fullName: { type: 'string' },
            role: { type: 'string', enum: ['student', 'examiner', 'administrator'] },
            department: { type: 'string' },
            enrollmentNumber: { type: 'string' },
          },
        },
        Question: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            questionText: { type: 'string' },
            questionType: { type: 'string', enum: ['mcq', 'true_false', 'short_answer'] },
            difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            marks: { type: 'number' },
            options: { type: 'array', items: { type: 'object' } },
          },
        },
        Exam: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            subjectName: { type: 'string' },
            status: { type: 'string', enum: ['draft', 'scheduled', 'active', 'completed', 'cancelled'] },
            startDatetime: { type: 'string', format: 'date-time' },
            endDatetime: { type: 'string', format: 'date-time' },
            durationMinutes: { type: 'integer' },
            totalMarks: { type: 'number' },
            passMarks: { type: 'number' },
          },
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object' },
            timestamp: { type: 'string', format: 'date-time' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' },
            errors: { type: 'array', items: { type: 'object' } },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Authentication', description: 'User auth and account management' },
      { name: 'Questions', description: 'Question bank management' },
      { name: 'Exams', description: 'Exam scheduling and configuration' },
      { name: 'Conduction', description: 'Live exam taking' },
      { name: 'Evaluation', description: 'Grading and review' },
      { name: 'Results', description: 'Results and reports' },
      { name: 'Notifications', description: 'Notification management' },
    ],
  },
  apis: ['./src/modules/**/*.routes.js'],
};

module.exports = swaggerJsdoc(options);
