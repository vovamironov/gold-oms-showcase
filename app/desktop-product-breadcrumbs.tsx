import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import styles from './desktop-product-breadcrumbs.module.css';

export function DesktopProductBreadcrumbs({ product }: { product: 'bars' | 'oms' | 'coins' }) {
  return (
    <Breadcrumb className={styles.breadcrumbs} data-product={product} aria-label="Хлебные крошки">
      <BreadcrumbList className={styles.list}>
        {product !== 'coins' && <>
          <BreadcrumbItem><BreadcrumbLink href="https://www.tbank.ru/">Частным лицам</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator><span className={styles.chevron} /></BreadcrumbSeparator>
        </>}
        <BreadcrumbItem><BreadcrumbLink href="/">Драгоценные металлы</BreadcrumbLink></BreadcrumbItem>
        <BreadcrumbSeparator><span className={styles.chevron} /></BreadcrumbSeparator>
        <BreadcrumbItem><BreadcrumbPage className={styles.current}>{product === 'bars' ? 'Слитки' : product === 'coins' ? 'Монеты' : 'Золотой счет'}</BreadcrumbPage></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}
