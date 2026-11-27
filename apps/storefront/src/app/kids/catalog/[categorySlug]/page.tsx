import { CategoryPageView, categoryMetadata, type CategoryRouteProps } from "@/components/category-page"
export const dynamic = "force-dynamic"
export function generateMetadata(props: CategoryRouteProps) { return categoryMetadata("kids", props) }
export default function Page(props: CategoryRouteProps) { return <CategoryPageView scope="kids" props={props} /> }
