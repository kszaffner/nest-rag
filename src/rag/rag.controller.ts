import {
  BadGatewayException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { RateLimitGuard } from './rate-limit.guard.js';
import type { Response } from 'express';
import { parseQuestionFromBody } from './rag-query-request.js';
import {
  RagService,
  type RagAnswer,
  type RagStreamEvent,
} from './rag.service.js';

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
      // The client gets a fixed text, so no internal detail (model name, URL,
      // key problem) leaks (OWASP API8).
      this.logFailure(error);
      throw new BadGatewayException(ANSWER_FAILED_MESSAGE);
    }
  }

  /**
   * Same as `query`, but the answer is sent while it is being written, as
   * Server-Sent Events: "sources", then many "delta", then "done". Everything
   * that can fail early (invalid question, search) happens before the first
   * byte is sent, so those errors are still normal 400/502 responses. A
   * failure later is reported as an "error" event with a fixed text.
   */
  @Post('query/stream')
  async queryStream(
    @Body() body: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const question = parseQuestionFromBody(body);
    const events = this.ragService.streamAnswer(question);

    // Stop producing (and paying for) the answer when the client leaves.
    let hasClientLeft = false;
    response.on('close', () => {
      hasClientLeft = true;
      void events.return(undefined);
    });

    let firstEvent: IteratorResult<RagStreamEvent>;
    try {
      firstEvent = await events.next();
    } catch (error) {
      this.logFailure(error);
      throw new BadGatewayException(ANSWER_FAILED_MESSAGE);
    }

    response.writeHead(HttpStatus.OK, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      // Tells reverse proxies such as nginx not to hold the stream back.
      'X-Accel-Buffering': 'no',
    });

    try {
      let current = firstEvent;
      while (!current.done && !hasClientLeft) {
        writeServerSentEvent(response, current.value);
        current = await events.next();
      }
    } catch (error) {
      this.logFailure(error);
      writeServerSentEvent(response, {
        type: 'error',
        message: ANSWER_FAILED_MESSAGE,
      });
    } finally {
      response.end();
    }
  }

  /** Only the error name is logged, see `query`. */
  private logFailure(error: unknown): void {
    this.logger.error(
      `Answering failed: ${error instanceof Error ? error.name : 'unknown error'}`,
    );
  }
}

const ANSWER_FAILED_MESSAGE = 'The answer could not be generated';

/** One event in the SSE format: an "event:" line, a one-line "data:" line, an empty line. */
function writeServerSentEvent(
  response: Response,
  event: { type: string; [field: string]: unknown },
): void {
  const { type, ...data } = event;
  response.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}
