/**
 * Unit tests for searxng_search tool handler
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searxngSearchHandler } from '../../searxng-search.js';
import { createMockToolContext } from '../../../../__tests__/helpers/mock-tool-context.js';

vi.mock('../../../tool-cancellation.js', () => ({
  checkCancellation: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('searxng_search tool', () => {
  let ctx: ReturnType<typeof createMockToolContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SEARXNG_URL;
    ctx = createMockToolContext();
  });

  describe('definition', () => {
    it('should have name "searxng_search"', () => {
      expect(searxngSearchHandler.name).toBe('searxng_search');
    });

    it('should have a definition with input_schema', () => {
      expect(searxngSearchHandler.definition).toBeDefined();
      expect(searxngSearchHandler.definition.name).toBe('searxng_search');
      expect(searxngSearchHandler.definition.input_schema).toBeDefined();
      expect(searxngSearchHandler.definition.input_schema.required).toContain('query');
    });
  });

  describe('execute', () => {
    it('should return results on successful search', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [
            { title: 'Result 1', url: 'http://example.com', content: 'Content 1', engine: 'google', score: 1.0 },
            { title: 'Result 2', url: 'http://example2.com', content: 'Content 2', engine: 'bing', score: 0.8 },
          ],
          number_of_results: 2,
        }),
        text: vi.fn().mockResolvedValue(''),
      });

      const result = await searxngSearchHandler.execute({ query: 'test query' }, ctx);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.total_results).toBe(2);
      expect(result.query).toBe('test query');
      expect(result.results[0].title).toBe('Result 1');
      expect(result.results[0].url).toBe('http://example.com');
      expect(result.results[1].title).toBe('Result 2');
      expect(result.message).toContain('test query');
    });

    it('should return empty results when no results found', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [],
          number_of_results: 0,
        }),
        text: vi.fn().mockResolvedValue(''),
      });

      const result = await searxngSearchHandler.execute({ query: 'obscure query' }, ctx);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(0);
      expect(result.total_results).toBe(0);
      expect(result.message).toContain('Aucun résultat');
    });

    it('should return error when API responds with non-ok status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: vi.fn(),
        text: vi.fn().mockResolvedValue('Service Unavailable'),
      });

      const result = await searxngSearchHandler.execute({ query: 'test' }, ctx);

      expect(result.success).toBe(false);
      expect(result.error).toContain('SearxNG Error');
      expect(result.error).toContain('503');
      expect(result.error).toContain('Service Unavailable');
    });

    it('should detect cancellation when error includes "cancelled"', async () => {
      mockFetch.mockRejectedValue(new Error('Request was cancelled'));

      const result = await searxngSearchHandler.execute({ query: 'test' }, ctx);

      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(result.error).toContain('annulée');
    });

    it('should detect cancellation when error includes "abort"', async () => {
      mockFetch.mockRejectedValue(new Error('The operation was abort'));

      const result = await searxngSearchHandler.execute({ query: 'test' }, ctx);

      expect(result.success).toBe(false);
      expect(result.cancelled).toBe(true);
      expect(result.error).toContain('annulée');
    });

    it('should return generic error for non-cancellation failures', async () => {
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      const result = await searxngSearchHandler.execute({ query: 'test' }, ctx);

      expect(result.success).toBe(false);
      expect(result.cancelled).toBeUndefined();
      expect(result.error).toContain('Network timeout');
    });

    it('should pass correct params to fetch URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], number_of_results: 0 }),
        text: vi.fn().mockResolvedValue(''),
      });

      await searxngSearchHandler.execute({
        query: 'test query',
        engines: 'google,bing',
        categories: 'news',
        language: 'en-US',
        time_range: 'day',
        safesearch: 2,
        pageno: 3,
      }, ctx);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('q=test+query');
      expect(fetchUrl).toContain('format=json');
      expect(fetchUrl).toContain('engines=google%2Cbing');
      expect(fetchUrl).toContain('categories=news');
      expect(fetchUrl).toContain('language=en-US');
      expect(fetchUrl).toContain('time_range=day');
      expect(fetchUrl).toContain('safesearch=2');
      expect(fetchUrl).toContain('pageno=3');
    });

    it('should use default values for optional params', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], number_of_results: 0 }),
        text: vi.fn().mockResolvedValue(''),
      });

      await searxngSearchHandler.execute({ query: 'test' }, ctx);

      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toContain('language=fr-FR');
      expect(fetchUrl).toContain('safesearch=0');
      expect(fetchUrl).toContain('pageno=1');
      expect(fetchUrl).toContain('engines=google');
      expect(fetchUrl).toContain('categories=general');
      expect(fetchUrl).not.toContain('time_range');
    });

    it('should use default SearxNG URL when SEARXNG_URL env is not set', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], number_of_results: 0 }),
        text: vi.fn().mockResolvedValue(''),
      });

      await searxngSearchHandler.execute({ query: 'test' }, ctx);

      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toMatch(/^http:\/\/localhost:8080\/search\?/);
    });

    it('should use SEARXNG_URL env variable when set', async () => {
      process.env.SEARXNG_URL = 'http://custom-searxng:9090';

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], number_of_results: 0 }),
        text: vi.fn().mockResolvedValue(''),
      });

      await searxngSearchHandler.execute({ query: 'test' }, ctx);

      const fetchUrl = mockFetch.mock.calls[0][0] as string;
      expect(fetchUrl).toMatch(/^http:\/\/custom-searxng:9090\/search\?/);
    });

    it('should limit results to 10', async () => {
      const manyResults = Array.from({ length: 15 }, (_, i) => ({
        title: `Result ${i + 1}`,
        url: `http://example.com/${i}`,
        content: `Content ${i + 1}`,
        engine: 'google',
        score: 1.0 - i * 0.05,
      }));

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: manyResults,
          number_of_results: 15,
        }),
        text: vi.fn().mockResolvedValue(''),
      });

      const result = await searxngSearchHandler.execute({ query: 'test' }, ctx);

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(10);
      expect(result.total_results).toBe(15);
    });

    it('should pass abort signal to fetch', async () => {
      const controller = new AbortController();
      ctx.abortSignal = controller.signal;

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ results: [], number_of_results: 0 }),
        text: vi.fn().mockResolvedValue(''),
      });

      await searxngSearchHandler.execute({ query: 'test' }, ctx);

      const fetchOptions = mockFetch.mock.calls[0][1];
      expect(fetchOptions.signal).toBe(controller.signal);
    });

    it('should truncate long content in formatted message', async () => {
      const longContent = 'A'.repeat(300);

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          results: [{ title: 'Result', url: 'http://example.com', content: longContent, engine: 'google', score: 1.0 }],
          number_of_results: 1,
        }),
        text: vi.fn().mockResolvedValue(''),
      });

      const result = await searxngSearchHandler.execute({ query: 'test' }, ctx);

      expect(result.success).toBe(true);
      expect(result.message).toContain('...');
    });
  });
});
