type RouteArgs = {
  request: Request;
  params?: Record<string, string | undefined>;
};

type RouteHandler<TArgs extends RouteArgs> = (args: TArgs) => Promise<Response> | Response;

type RouteContext = Record<string, string | number | boolean | undefined>;

const getRequestTarget = (request: Request) => {
  const url = new URL(request.url);
  return `${request.method} ${url.pathname}${url.search}`;
};

const formatContext = (context?: RouteContext) => {
  if (!context) {
    return "";
  }

  const entries = Object.entries(context).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return "";
  }

  return ` ${entries.map(([key, value]) => `${key}=${value}`).join(" ")}`;
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
};

export const withApiRequestLogging = <TArgs extends RouteArgs>(
  name: string,
  handler: RouteHandler<TArgs>,
  getContext?: (args: TArgs, response?: Response) => RouteContext
) => {
  return async (args: TArgs) => {
    const startedAt = Date.now();
    const target = getRequestTarget(args.request);

    console.info(`[api] -> ${name} ${target}${formatContext(getContext?.(args))}`);

    try {
      const response = await handler(args);
      const durationMs = Date.now() - startedAt;

      console.info(
        `[api] <- ${name} ${target} status=${response.status} duration=${durationMs}ms${formatContext(getContext?.(args, response))}`
      );

      return response;
    } catch (error) {
      const durationMs = Date.now() - startedAt;

      console.error(
        `[api] !! ${name} ${target} duration=${durationMs}ms${formatContext(getContext?.(args))} error=${getErrorMessage(error)}`
      );

      throw error;
    }
  };
};
