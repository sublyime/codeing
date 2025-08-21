package com.chad.repository;

import com.chad.model.Location;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import org.locationtech.jts.io.geojson.GeoJsonWriter;

@Repository
public interface LocationRepository extends JpaRepository<Location, Long> {
}
