import { BadRequestException } from '@nestjs/common';
import { MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS } from '../llm/llm-input-limits.js';
import { parseQuestionFromBody } from './rag-query-request.js';

describe('parseQuestionFromBody', () => {
  it('returns the question', () => {
    expect(parseQuestionFromBody({ question: 'Where?' })).toBe('Where?');
  });

  it('ignores other fields', () => {
    expect(
      parseQuestionFromBody({ question: 'Where?', systemPrompt: 'x' }),
    ).toBe('Where?');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'Where?'],
    ['an array', ['Where?']],
    ['no question', {}],
    ['a number', { question: 42 }],
    ['an object', { question: { text: 'Where?' } }],
    ['an empty question', { question: '' }],
    ['a blank question', { question: '  \n ' }],
    [
      'a too long question',
      { question: 'a'.repeat(MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS + 1) },
    ],
  ])('rejects %s', (_name, body) => {
    expect(() => parseQuestionFromBody(body)).toThrow(BadRequestException);
  });

  it('accepts a question of exactly the maximum length', () => {
    const question = 'a'.repeat(MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS);
    expect(parseQuestionFromBody({ question })).toBe(question);
  });

  it('does not repeat the question in the error message', () => {
    const secret = 'secret'.repeat(MAX_USER_MESSAGE_LENGTH_IN_CHARACTERS);
    expect(() => parseQuestionFromBody({ question: secret })).toThrow(
      /^(?!.*secretsecret)/,
    );
  });
});
