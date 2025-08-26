package com.chad.repository;

import com.chad.model.Chemical;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChemicalRepository extends JpaRepository<Chemical, Long> {

    List<Chemical> findByNameIgnoreCase(String name);
}
