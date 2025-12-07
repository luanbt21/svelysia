import { routes } from "../../../api/routes";

interface WithRequest {
  request: Request;
}

export const fallback = ({ request }: WithRequest) => routes.handle(request);
