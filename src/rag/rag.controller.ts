import {
  BadGatewayException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UseGuards,
} from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard.js';
import { parseQuestionFromBody } from './rag-query-request.js';
import { RagService, type RagAnswer } from './rag.service.js';

@Controller('rag')
@UseGuards(RateLimitGuard)
export class RagController {
  private readonly logger = new Logger(RagController.name);

  constructor(private readonly ragService: RagService) {}

  /** Answers a question using the indexed documents. Body: {"question": "..."} */
  @Post('query')
  @HttpCode(HttpStatus.OK)
  async query(@Body() body: unknown): Promise<RagAnswer> {
    const question = parseQuestionFromBody(body);

    try {
      return await this.ragService.answerQuestion(question);
    } catch (error) {
      // Only the error name is logged: the message may come from a provider
      // and the question is never logged. The client gets a fixed text, so no
      // internal detail (model name, URL, key problem) leaks (OWASP API8).
      this.logger.error(
        `Answering failed: ${error instanceof Error ? error.name : 'unknown error'}`,
      );
      throw new BadGatewayException('The answer could not be generated');
    }
  }
}
