import { Button } from '@/components/ui/button';
import styles from './product-configurator-link.module.css';

export function ProductConfiguratorLink({ product }: { product: 'bars' | 'oms' | 'coins' }) {
  return (
    <Button
      className={`${styles.link} ${styles[product === 'coins' ? 'bars' : product]}`}
      render={<a href={product === 'coins' ? '#coins-configurator' : `#${product}-showcase`} />}
      nativeButton={false}
      role="link"
    >
      {product === 'oms' ? 'Купить золото' : product === 'coins' ? 'Выбрать монету' : 'Выбрать слиток'}
    </Button>
  );
}
