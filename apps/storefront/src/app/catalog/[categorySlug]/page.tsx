import { CategoryPageView, categoryMetadata, type CategoryRouteProps } from "@/components/category-page"
export const dynamic = "force-dynamic"
export function generateMetadata(props: CategoryRouteProps) { return categoryMetadata("main", props) }
export default function Page(props: CategoryRouteProps) { return <CategoryPageView scope="main" props={props} /> }
