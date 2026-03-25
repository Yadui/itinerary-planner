import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

export default function JoinPage() {
  const { id, token } = useParams();
  const navigate = useNavigate();

  // Redirect old-style join links to the new ?join=token format handled by TripPage
  useEffect(() => {
    navigate(`/trip/${id}?join=${token}`, { replace: true });
  }, [id, token]);

  return (
    <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-gray-300 border-t-[#007AFF] rounded-full animate-spin" />
    </div>
  );
}
