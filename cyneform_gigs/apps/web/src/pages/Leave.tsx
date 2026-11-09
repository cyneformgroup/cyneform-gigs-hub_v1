import { MyLeave } from "../components/leave/MyLeave";
import { ReviewQueue } from "../components/leave/ReviewQueue";
import { PageHeader } from "../components/ui";
import { useAuth } from "../lib/auth";

export function Leave() {
  const { can } = useAuth();
  return (
    <>
      <PageHeader title="Leave" />
      <div className="space-y-8">
        {can("leave.request") && <MyLeave />}
        {can("leave.view_all") && <ReviewQueue />}
      </div>
    </>
  );
}
