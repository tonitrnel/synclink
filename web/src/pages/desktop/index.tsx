import { useUserStore } from '~/store';
import { Navigate } from 'react-router-dom';

export default function IndexPage() {
    const access_preference = useUserStore().access_preference;
    if (!access_preference) return <Navigate to="/welcome" replace />;
    else return <Navigate to="/stash" replace />;
}
