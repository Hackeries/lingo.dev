import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// Mock the 'bitbucket' module used by the SUT
vi.mock("bitbucket", () => {
  const mockListPullRequests = vi.fn();
  class Bitbucket {
    repositories = {
      listPullRequests: mockListPullRequests,
    };
  }
  return {
    __esModule: true,
    default: { Bitbucket },
    mockListPullRequests,
  } as any;
});

// Import after mocking so the SUT picks up the mock
import { BitbucketPlatformKit } from "./bitbucket";
import * as bbMock from "bitbucket";

const originalEnv = { ...process.env };

describe("BitbucketPlatformKit#getOpenPullRequestNumber (pagination)", () => {
  beforeEach(() => {
    process.env.BITBUCKET_BRANCH = "main";
    process.env.BITBUCKET_REPO_FULL_NAME = "org/repo";
    delete process.env.BB_TOKEN;

    // Reset mock state
    (bbMock as any).mockListPullRequests.mockReset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("follows pagination until a matching PR is found", async () => {
    const mockList = (bbMock as any).mockListPullRequests as ReturnType<
      typeof vi.fn
    >;

    // Page 1: no matching PR, has `next` link
    mockList.mockResolvedValueOnce({
      data: {
        values: [
          {
            id: 1,
            source: { branch: { name: "feature-other" } },
            destination: { branch: { name: "main" } },
          },
        ],
        next: "https://api.bitbucket.org/2.0/repositories/org/repo/pullrequests?page=2",
      },
    });

    // Page 2: matching PR present
    mockList.mockResolvedValueOnce({
      data: {
        values: [
          {
            id: 42,
            source: { branch: { name: "feature-x" } },
            destination: { branch: { name: "main" } },
          },
        ],
      },
    });

    const kit = new BitbucketPlatformKit();
    const prId = await kit.getOpenPullRequestNumber({ branch: "feature-x" });

    expect(prId).toBe(42);
    expect(mockList).toHaveBeenCalledTimes(2);

    const firstCallArgs = mockList.mock.calls[0][0];
    const secondCallArgs = mockList.mock.calls[1][0];

    expect(firstCallArgs).toMatchObject({ state: "OPEN", page: 1, pagelen: 50 });
    expect(secondCallArgs).toMatchObject({ state: "OPEN", page: 2, pagelen: 50 });
  });

  it("returns undefined when no matching PR exists across pages", async () => {
    const mockList = (bbMock as any).mockListPullRequests as ReturnType<
      typeof vi.fn
    >;

    // Single page with no match and no `next`
    mockList.mockResolvedValueOnce({
      data: {
        values: [
          {
            id: 7,
            source: { branch: { name: "feature-other" } },
            destination: { branch: { name: "main" } },
          },
        ],
      },
    });

    const kit = new BitbucketPlatformKit();
    const prId = await kit.getOpenPullRequestNumber({ branch: "feature-x" });

    expect(prId).toBeUndefined();
    expect(mockList).toHaveBeenCalledTimes(1);
  });
});
