export interface PaginationDto {
  page: number;
  per_page: number;
  last_page: number;
  total_rows: number;
}

export interface RecordsDto<T> {
  items: T[];
  pagination: PaginationDto;
}
export interface PaginationDto {
  page: number;
  per_page: number;
  last_page: number;
  total_rows: number;
}

export interface RecordsDto<T> {
  items: T[];
  pagination: PaginationDto;
}
